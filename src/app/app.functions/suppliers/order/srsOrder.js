/**
 * Shape Language: Input → Filter → Transform → Store → Output → Loop
 * 
 * Input: Context (optional environment parameter)
 * Filter: Validates credentials exist
 * Transform: Gets credentials from config, creates auth token, formats order
 * Store: N/A
 * Output: Order submission response from SRS API
 * Loop: Self-healing - reads environment from order config if not provided
 */

const axios = require("axios");
const qs = require("qs");
const { getCredentials } = require("../config/getCredentials");
const { normalizeInput } = require("./normalizeInput");
const { formatOrder } = require("./formatOrder");
const { logOrder } = require("./logOrder");

/**
 * Build hardcoded test payload for SRS sandbox testing
 * Maintains exact structure required by SRS API
 */
function buildHardcodedTestPayload() {
    return {
        "sourceSystem": "RHINO",
        "customerCode": "RCO207",
        "jobAccountNumber": 1,
        "branchCode": "SSSAN",
        "accountNumber": "DEMO001",
        "transactionID": "3932cdd6-38e7-4d19-a05c-cd866473bdea",
        "transactionDate": "2023-05-11T10:49:34.187",
        "notes": "",
        "shipTo": {
           "name": "John",
           "addressLine1": "1234 COUNTY LINE ROAD",
           "addressLine2": "",
           "addressLine3": "",
           "city": "ONTARIO",
           "state": "NY",
           "zipCode": "14519"
        },
        "poDetails": {
           "poNumber": "5641-8Test",
           "reference": "5641: 7GP",
           "jobNumber": "",
           "orderDate": "2025-12-01",
           "expectedDeliveryDate": "2021-04-15",
           "expectedDeliveryTime": "Anytime",
           "orderType": "WHSE",
           "shippingMethod": "Ground Drop"
        },
        "orderLineItemDetails": [
           {
              "productId": 5572,
              "productName": "Gentek Driftwood II Vinyl Siding D4",
              "option": "",
              "quantity": 1,
              "price": 12,
              "customerItem": "XXXX",
              "uom": "SQ"
           },
        ],
        "customerContactInfo": {
           "customerContactName": "John Dough",
           "customerContactPhone": "9876543210",
           "customerContactEmail": "jdough@example.com",
           "customerContactAddress": {
              "addressLine1": "123 Main St",
              "city": "Salt Lake City",
              "state": "Utah",
              "zipCode": "84121"
           },
           "additionalContactEmails": [
              "test@example.com"
           ]
        }
    };
}

/**
 * Build payload dynamically based on environment and parameters
 * Maintains EXACT same structure as hardcoded version
 */
function buildPayload(context, credentials) {
    const { orderBody, useTestPayload } = context.parameters || {};
    const isSandbox = credentials.environment === "sandbox";
    
    // Flag-based test payload: Only use hardcoded test if explicitly enabled
    // Default: false (use real order data) for both sandbox and production
    // Set useTestPayload=true to use hardcoded test payload
    if (useTestPayload === true) {
        return buildHardcodedTestPayload();
    }
    
    // Production or sandbox with useTestPayload=false/undefined → use orderBody
    if (!orderBody) {
        const errorMsg = isSandbox 
            ? "orderBody is required. Set useTestPayload=true to use test payload in sandbox"
            : "orderBody is required for production orders";
        throw new Error(errorMsg);
    }
    
    // Normalize and format
    const normalized = normalizeInput(orderBody);
    if (!normalized) {
        throw new Error("Failed to normalize order input");
    }
    
    const formatted = formatOrder(normalized, "SRS", credentials.environment);
    
    // formatOrder returns object for SRS (not array like ABC)
    // Map formatted output to EXACT same structure as hardcoded version
    return {
        sourceSystem: formatted.sourceSystem || "RHINO",
        customerCode: formatted.customerCode || "",
        jobAccountNumber: formatted.jobAccountNumber || 1,
        branchCode: formatted.branchCode || "",
        accountNumber: formatted.accountNumber || "",
        transactionID: formatted.transactionID || `txn-${Date.now()}`,
        transactionDate: formatted.transactionDate || new Date().toISOString(),
        notes: formatted.notes || "",
        shipTo: {
            name: formatted.shipTo?.name || "",
            addressLine1: formatted.shipTo?.addressLine1 || "",
            addressLine2: formatted.shipTo?.addressLine2 || "",
            addressLine3: formatted.shipTo?.addressLine3 || "",
            city: formatted.shipTo?.city || "",
            state: formatted.shipTo?.state || "",
            zipCode: formatted.shipTo?.zipCode || ""
        },
        poDetails: {
            poNumber: formatted.poDetails?.poNumber || "",
            reference: formatted.poDetails?.reference || "",
            jobNumber: formatted.poDetails?.jobNumber || "",
            orderDate: formatted.poDetails?.orderDate || "",
            expectedDeliveryDate: formatted.poDetails?.expectedDeliveryDate || "",
            expectedDeliveryTime: formatted.poDetails?.expectedDeliveryTime || "Anytime",
            orderType: formatted.poDetails?.orderType || "WHSE",
            shippingMethod: formatted.poDetails?.shippingMethod || "Ground Drop"
        },
        orderLineItemDetails: formatted.orderLineItemDetails || [],
        customerContactInfo: {
            customerContactName: formatted.customerContactInfo?.customerContactName || "",
            customerContactPhone: formatted.customerContactInfo?.customerContactPhone || "",
            customerContactEmail: formatted.customerContactInfo?.customerContactEmail || "",
            customerContactAddress: {
                addressLine1: formatted.customerContactInfo?.customerContactAddress?.addressLine1 || "",
                city: formatted.customerContactInfo?.customerContactAddress?.city || "",
                state: formatted.customerContactInfo?.customerContactAddress?.state || "",
                zipCode: formatted.customerContactInfo?.customerContactAddress?.zipCode || ""
            },
            additionalContactEmails: formatted.customerContactInfo?.additionalContactEmails || []
        }
    };
}

exports.main = async (context = {}) => {
    // Get environment from context or read from config
    const environment = context.parameters?.environment || null;
    const credentials = getCredentials("SRS", environment);

    console.log(`Placing SRS order (${credentials.environment})...`);

    if (!credentials.clientId || !credentials.clientSecret) {
        return {
            success: false,
            message: "SRS credentials missing",
            error: `SRS credentials not found for environment: ${credentials.environment}`,
        };
    }

    const data = qs.stringify({
        grant_type: "client_credentials",
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        scope: "ALL"
    });

    const config = {
        method: "post",
        url: credentials.authUrl,
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        },
        data: data
    }

    try {
        const response = await axios(config);
        console.log("SRS Response:", response.data?.access_token);

        // Build payload dynamically based on environment and flags
        const orderData = buildPayload(context, credentials);
        
        // Log order payload before sending to supplier API
        logOrder(orderData, "SRS", "before sending to SRS API");

            const orderConfig = {
                method: "POST",
                url: `${credentials.apiBaseUrl}/orders/v2/Submit`,
                headers: {
                    Authorization: `Bearer ${response.data?.access_token}`,
                    "Content-Type": "application/json"
                },
                data: orderData,
                timeout: 15000 // 15 seconds - must complete before HubSpot's 15s limit
            }

            console.log("Submitting SRS order...");
            
            // Race against HubSpot's 15s timeout - return early if needed
            const hubspotTimeout = new Promise((resolve) => 
                setTimeout(() => resolve({
                    success: true,
                    message: "Order submitted (response pending)",
                    warning: "Function timeout - order may have been processed successfully",
                    transactionID: orderData.transactionID,
                    note: "Check server logs for full order response"
                }), 12000) // Return at 12s to avoid HubSpot timeout
            );
            
            const orderPromise = axios(orderConfig).then(orderResponse => {
                console.log("Order Response:", orderResponse.data);
                return {
                    success: true,
                    message: `SRS Order successful (${credentials.environment})`,
                    orderResponse: orderResponse.data,
                    environment: credentials.environment,
                };
            });
            
            // Return whichever completes first
            return await Promise.race([orderPromise, hubspotTimeout]);


    } catch (error) {
    
        console.error("Error during SRS Authentication:", error);
        return {
            success: false,
            message: "SRS Authentication failed",
            error: error.message
        }
    }
}