const axios = require("axios");

exports.main = async (context = {}) => {

    // Validate credentials exist before attempting authentication
    const abcClientId = process.env.ABCClientSandbox;
    const abcClientSecret = process.env.ABCClientSecretSandbox;

    if (!abcClientId || !abcClientSecret) {
        console.error("ABC Sandbox credentials missing:", {
            hasClientId: !!abcClientId,
            hasClientSecret: !!abcClientSecret
        });
        return {
            success: false,
            message: "ABC Sandbox authentication failed",
            error: "Missing ABCClientSandbox or ABCClientSecretSandbox environment variables",
            status: 401
        };
    }

    const abcBasic64AuthKey = Buffer.from(`${abcClientId}:${abcClientSecret}`).toString('base64');
    const { orderBody } = context.parameters || {};
    const useHardcodedOrder = !orderBody;

    const authEndpoint = "https://sandbox.auth.partners.abcsupply.com/oauth2/aus1vp07knpuqf6Xz0h8/v1/token";
    const orderApiEndpoint = "https://partners-sb.abcsupply.com/api/order/v2/orders";
    
    console.log("ABC Sandbox Order | Auth:", authEndpoint.includes("sandbox") ? "sandbox ✓" : "production");
    console.log("ABC Sandbox Order | API:", orderApiEndpoint.includes("-sb") ? "sandbox ✓" : "production");

    const config = {
        method: "post",
        url: `${authEndpoint}?grant_type=client_credentials&scope=order.write order.read`,
        headers: {
            Authorization: `Basic ${abcBasic64AuthKey}`,
            "Content-Type": "application/x-www-form-urlencoded",
        },
    };

    // Declare token variable outside try block for error logging
    let abcAccessToken = null;
    let tokenTimestamp = null;

    try {
        const response = await axios(config);
        
        // Validate token fetch was successful and token exists
        if (!response || !response.data || !response.data.access_token) {
            console.error("ABC token fetch failed - no access token in response");
            return {
                success: false,
                message: "ABC Sandbox authentication failed",
                error: "No access token returned from authentication endpoint",
                status: 401
            };
        }

        abcAccessToken = response.data.access_token;
        tokenTimestamp = Date.now();
        
        // Verify scopes include order.write and order.read
        const grantedScopes = response.data?.scope ? response.data.scope.split(' ') : [];
        const hasOrderWrite = grantedScopes.includes('order.write');
        const hasOrderRead = grantedScopes.includes('order.read');
        const expiresIn = response.data?.expires_in ? Math.round(response.data.expires_in / 60) : null;
        
        console.log("Token obtained | Expires:", expiresIn ? `${expiresIn}m` : "unknown", "| Scopes:", hasOrderWrite && hasOrderRead ? "✓" : "✗");
        
        if (!hasOrderWrite || !hasOrderRead) {
            console.warn("⚠️ Missing required scopes (order.write, order.read)");
        }

        // Validate token exists before creating order config
        if (!abcAccessToken) {
            console.error("ABC Access token is undefined - cannot proceed with order");
            return {
                success: false,
                message: "ABC Sandbox authentication failed",
                error: "Access token is undefined",
                status: 401
            };
        }

        
        // TEMPORARY: Hardcoded order for format reference
        // This shows the exact structure that works with ABC API
        // NOTE: Branch number and Ship-To number must be valid for your sandbox account
        // 401 error "Ship-To number or branch number are invalid for the user" means these values don't exist in your sandbox
        
        const branchNumber = process.env.ABC_SANDBOX_BRANCH_NUMBER || "461";
        const shipToNumber = process.env.ABC_SANDBOX_SHIP_TO_NUMBER || "2063975-2";
        
        console.log("Order config | Branch:", branchNumber, "| Ship-To:", shipToNumber);
        
        const hardcodedOrder = [{
            "requestId": "12345", // Random number for uniqueness
            "trackingId": "", // Optional
            "purchaseOrder": "999999-9", // Optional
            "branchNumber": branchNumber, // Must be valid for your sandbox account
            "deliveryService": "OTG",
            "typeCode": "SO", // Delivery Request
            "dates": {
              "deliveryRequestedFor": "2026-03-05"
            },
            "deliveryAppointment": {
              "instructionsTypeCode": "AT",
              "instructions": "Please leave in driveway",
              "fromTime": "10:00", // Default if missing
              "toTime": "11:00", // Default if missing
              "timeZoneCode": "CT" // Central Time - Should be dynamic if applicable
            },
            "currency": "USD",
            "shipTo": {
              "number": shipToNumber, // Must be valid for your sandbox account
              "address": {
                "line1": "123 Main St",
                "line2": "Apt 1",
                "line3": "",
                "city": "Anytown",
                "state": "TX",
                "postal": "12345",
                "country": "USA"
              },
              "contacts": [
                {
                  "name": "Adrian Johnson",
                  "functionCode": "SM", // Site Manager/Contact
                  "email": "adrian@rhinoroofers.com",
                  "phones": [
                    {
                      "number": "555-555-5555",
                      "type": "MOBILE",
                      "ext": ""
                    }
                  ]
                }
              ]
            },
            "lines": [
                {
                    "id": "1",            // string ID (required by API)
                    "itemNumber": "79BBL30HG5",  // SKU/item number
                    "itemDescription": "Test Product Description", // Product description (required)
                    "orderedQty": {
                      "value": 1,          // quantity ordered
                      "uom": "EA"          // unit of measure (EA, DR, RL, PC, etc.)
                    },
                    "unitPrice": {
                      "value": 0.00,       // unit price (required by API)
                      "uom": "EA",         // unit of measure (required by API)
                      "instructions": ""   // required by API (can be empty)
                    },
                    "comments": {
                      "code": "D",         // Comment code (D = Description/Detail)
                      "description": "TEST ORDER - DO NOT FULFILL" // Line comment text
                    }
                  }
            ]
          }];

        let orderPayload;
        if (useHardcodedOrder) {
            orderPayload = hardcodedOrder;
            console.log("Using hardcoded order | Lines:", orderPayload[0]?.lines?.length || 0);
        } else {
            orderPayload = Array.isArray(orderBody) ? orderBody : [orderBody];
            if (orderPayload.length === 0) {
                console.warn("Order payload empty, using hardcoded order");
                orderPayload = hardcodedOrder;
            } else {
                console.log("Using orderBody | Lines:", orderPayload[0]?.lines?.length || 0);
            }
        }

        const orderConfig = {
            method: "post",
            url: orderApiEndpoint,
            headers: {
                Authorization: `Bearer ${abcAccessToken}`,
                "Content-Type": "application/json",
            },
            data: orderPayload
        };
        
        console.log("Submitting order to ABC Sandbox API...");
        const orderResponse = await axios(orderConfig);
        console.log("Order placed successfully ✓");
        return {
            success: true,
            message: "Order placed successfully",
            data: orderResponse.data,
        };
    } catch (error) {
        const status = error?.response?.status;
        const data = error?.response?.data;
        const requestData = error?.config?.data;
        const errorMessage = data?.errorMessage || data?.error?.errorMessage || error?.message || "";
      
        if (status === 401) {
            console.error("401 Unauthorized |", errorMessage);
            
            // Check if error message indicates Ship-To/Branch issue
            if (errorMessage.includes("Ship-To") || errorMessage.includes("branch") || errorMessage.includes("invalid")) {
                console.error("Issue: Invalid Ship-To or Branch Number");
                console.error("  Branch:", requestData?.[0]?.branchNumber || "N/A");
                console.error("  Ship-To:", requestData?.[0]?.shipTo?.number || "N/A");
                console.error("  Fix: Update ABC_SANDBOX_BRANCH_NUMBER and ABC_SANDBOX_SHIP_TO_NUMBER env vars");
            } else {
                console.error("Issue: Authentication failed");
                console.error("  Token obtained:", !!abcAccessToken ? "✓" : "✗");
                console.error("  Scopes:", abcAccessToken ? "check logs above" : "N/A");
            }
        } else {
            console.error(`Error ${status || 'unknown'} |`, errorMessage || error?.message || "Unknown error");
        }
      
        return {
          success: false,
          message: (status === 401 || error?.message?.includes('401')) ? "ABC Sandbox authentication failed - check credentials and token" : "Order placement failed",
          error: data || error?.message || "Unknown error",
          status: status || 500,
        };
      }
}