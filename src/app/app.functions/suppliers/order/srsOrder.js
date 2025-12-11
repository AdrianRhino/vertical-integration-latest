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

    console.log("Printing OrderDate: ", formatted.poDetails?.orderDate);
    
    // SAFETY CHECK: Ensure orderDate is not empty (formatOrder should handle this, but double-check)
    if (formatted.poDetails && (!formatted.poDetails.orderDate || formatted.poDetails.orderDate.trim() === "")) {
        const today = new Date();
        formatted.poDetails.orderDate = today.toISOString().split('T')[0];
        console.log("⚠️ orderDate was empty after formatOrder, set to:", formatted.poDetails.orderDate);
    }
    
    // formatOrder returns object for SRS (not array like ABC)
    // Map formatted output to EXACT same structure as hardcoded version
    
    // Compute orderDate FIRST - this is critical and must never be empty
    let orderDateValue;
    try {
        const today = new Date();
        const defaultDate = today.toISOString().split('T')[0]; // YYYY-MM-DD format
        
        const providedDate = formatted.poDetails?.orderDate;
        console.log("🔍 orderDate validation - providedDate:", providedDate, "type:", typeof providedDate);
        
        // Validate: must be a non-empty string after trimming
        const isDateValid = providedDate && 
                           typeof providedDate === 'string' && 
                           providedDate.trim() !== "" &&
                           providedDate.trim().length >= 8; // Basic date format check
        
        console.log("🔍 orderDate validation - isDateValid:", isDateValid);
        
        if (isDateValid) {
            orderDateValue = providedDate.trim();
            console.log("✅ Using provided orderDate:", orderDateValue);
        } else {
            orderDateValue = defaultDate;
            console.log("⚠️ orderDate invalid, using default:", orderDateValue);
        }
    } catch (error) {
        // Fallback if anything goes wrong
        const today = new Date();
        orderDateValue = today.toISOString().split('T')[0];
        console.log("❌ Error in orderDate logic, using fallback:", orderDateValue, error);
    }
    
    // Ensure it's never empty (final safety check)
    if (!orderDateValue || orderDateValue.trim() === "") {
        const today = new Date();
        orderDateValue = today.toISOString().split('T')[0];
        console.log("🚨 orderDate was still empty after logic, forced to:", orderDateValue);
    }
    
    console.log("✅ Final orderDate value:", orderDateValue);
    
    // Build payload using formatted values directly (formatOrder already applied config defaults)
    // Keep critical safety check for orderDate (required field)
    return {
        sourceSystem: formatted.sourceSystem,
        customerCode: formatted.customerCode || "",
        jobAccountNumber: formatted.jobAccountNumber,
        branchCode: formatted.branchCode || "",
        accountNumber: formatted.accountNumber || "",
        transactionID: formatted.transactionID,
        transactionDate: formatted.transactionDate,
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
            // SRS requires orderDate - ALWAYS set to current date if not provided or empty (format: YYYY-MM-DD)
            // This is a critical required field - never submit empty
            // CRITICAL: Force set to today's date if somehow still empty (safety check)
            orderDate: (() => {
                // Final safety check - ensure we never return empty
                if (!orderDateValue || orderDateValue.trim() === "") {
                    const today = new Date();
                    const forcedDate = today.toISOString().split('T')[0];
                    console.error("🚨 CRITICAL: orderDateValue was empty in object assignment! Forcing to:", forcedDate);
                    return forcedDate;
                }
                return orderDateValue;
            })(),
            expectedDeliveryDate: formatted.poDetails?.expectedDeliveryDate || "",
            expectedDeliveryTime: formatted.poDetails?.expectedDeliveryTime,
            orderType: formatted.poDetails?.orderType,
            shippingMethod: formatted.poDetails?.shippingMethod
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
    
    // FINAL VERIFICATION: Ensure orderDate is NEVER empty before returning
    if (!payload.poDetails || !payload.poDetails.orderDate || payload.poDetails.orderDate.trim() === "") {
        const today = new Date();
        const forcedDate = today.toISOString().split('T')[0];
        console.error("🚨🚨🚨 CRITICAL ERROR: orderDate is empty in final payload! Forcing to:", forcedDate);
        payload.poDetails = payload.poDetails || {};
        payload.poDetails.orderDate = forcedDate;
    }
    
    console.log("🔍 FINAL PAYLOAD CHECK - orderDate:", payload.poDetails?.orderDate);
    
    return payload;
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

    // Log credential status (without exposing secrets)
    console.log("SRS Authentication Request:", {
        environment: credentials.environment,
        authUrl: credentials.authUrl,
        apiBaseUrl: credentials.apiBaseUrl,
        hasClientId: !!credentials.clientId,
        hasClientSecret: !!credentials.clientSecret,
        clientIdLength: credentials.clientId?.length || 0,
        clientSecretLength: credentials.clientSecret?.length || 0,
        clientIdPrefix: credentials.clientId ? credentials.clientId.substring(0, 4) + "..." : "missing",
        clientSecretPrefix: credentials.clientSecret ? credentials.clientSecret.substring(0, 4) + "..." : "missing"
    });

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

    console.log("Auth Request Details:", {
        url: config.url,
        method: config.method,
        contentType: config.headers["Content-Type"],
        dataLength: data.length,
        dataPreview: data.substring(0, 50) + "..." // First 50 chars (won't show full secret)
    });
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/b131dc2d-5624-4f61-98fb-efc543f7726a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'srsOrder.js:207',message:'AUTH_CONFIG_READY',data:{url:config.url,method:config.method,dataLength:data.length,credentialsEnv:credentials.environment,hasClientId:!!credentials.clientId,clientIdLength:credentials.clientId?.length||0,hasClientSecret:!!credentials.clientSecret,clientSecretLength:credentials.clientSecret?.length||0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion

    try {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/b131dc2d-5624-4f61-98fb-efc543f7726a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'srsOrder.js:209',message:'AUTH_REQUEST_START',data:{url:config.url,hasClientId:!!credentials.clientId,hasClientSecret:!!credentials.clientSecret,dataLength:data.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
        
        const response = await axios(config);
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/b131dc2d-5624-4f61-98fb-efc543f7726a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'srsOrder.js:213',message:'AUTH_SUCCESS',data:{hasAccessToken:!!response.data?.access_token,status:response.status},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
        
        console.log("SRS Response:", response.data?.access_token);

        // Build payload dynamically based on environment and flags
        const orderData = buildPayload(context, credentials);
        
        // #region agent log
        const poDetailsSnapshot = orderData.poDetails ? {
            poNumber: orderData.poDetails.poNumber || 'empty',
            reference: orderData.poDetails.reference || 'empty',
            jobNumber: orderData.poDetails.jobNumber || 'empty',
            orderDate: orderData.poDetails.orderDate || 'MISSING',
            expectedDeliveryDate: orderData.poDetails.expectedDeliveryDate || 'empty',
            expectedDeliveryTime: orderData.poDetails.expectedDeliveryTime || 'empty',
            orderType: orderData.poDetails.orderType || 'empty',
            shippingMethod: orderData.poDetails.shippingMethod || 'empty'
        } : null;
        fetch('http://127.0.0.1:7242/ingest/b131dc2d-5624-4f61-98fb-efc543f7726a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'srsOrder.js:256',message:'ORDER_PAYLOAD_BUILT',data:{hasPoDetails:!!orderData.poDetails,poDetailsSnapshot,orderDateInPayload:orderData.poDetails?.orderDate||'MISSING',orderDateLength:orderData.poDetails?.orderDate?.length||0},timestamp:Date.now(),sessionId:'debug-session',runId:'run5',hypothesisId:'H'})}).catch(()=>{});
        // #endregion
        
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
            
            // #region agent log
            // Log the actual payload being sent to SRS API
            const poDetailsInRequest = orderConfig.data.poDetails;
            fetch('http://127.0.0.1:7242/ingest/b131dc2d-5624-4f61-98fb-efc543f7726a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'srsOrder.js:274',message:'AXIOS_REQUEST_PAYLOAD',data:{hasPoDetails:!!poDetailsInRequest,orderDate:poDetailsInRequest?.orderDate||'MISSING',orderDateType:typeof poDetailsInRequest?.orderDate,orderDateLength:poDetailsInRequest?.orderDate?.length||0,poDetailsKeys:poDetailsInRequest?Object.keys(poDetailsInRequest):null,fullPoDetails:poDetailsInRequest},timestamp:Date.now(),sessionId:'debug-session',runId:'run6',hypothesisId:'L'})}).catch(()=>{});
            // #endregion
            
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
            
            const orderPromise = axios(orderConfig)
                .then(orderResponse => {
                    console.log("Order Response:", orderResponse.data);
                    return {
                        success: true,
                        message: `SRS Order successful (${credentials.environment})`,
                        orderResponse: orderResponse.data,
                        environment: credentials.environment,
                    };
                })
                .catch(orderError => {
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/b131dc2d-5624-4f61-98fb-efc543f7726a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'srsOrder.js:260',message:'ORDER_PROMISE_REJECTED',data:{hasResponse:!!orderError.response,status:orderError.response?.status,errorData:JSON.stringify(orderError.response?.data||{}).substring(0,500)},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'G'})}).catch(()=>{});
                    // #endregion
                    // Re-throw so it's caught by outer catch block
                    throw orderError;
                });
            
            // Return whichever completes first
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/b131dc2d-5624-4f61-98fb-efc543f7726a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'srsOrder.js:268',message:'PROMISE_RACE_START',data:{orderPromiseType:typeof orderPromise,hubspotTimeoutType:typeof hubspotTimeout},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'G'})}).catch(()=>{});
            // #endregion
            return await Promise.race([orderPromise, hubspotTimeout]);


    } catch (error) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/b131dc2d-5624-4f61-98fb-efc543f7726a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'srsOrder.js:257',message:'ERROR_CAUGHT_RAW',data:{errorType:typeof error,hasResponse:!!error.response,hasConfig:!!error.config,status:error.response?.status,responseDataType:typeof error.response?.data,responseDataIsString:typeof error.response?.data==='string',responseDataKeys:error.response?.data?Object.keys(error.response.data):null,errorMessage:error.message,errorName:error.name,fullErrorStructure:JSON.stringify(error,Object.getOwnPropertyNames(error)).substring(0,500)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,C'})}).catch(()=>{});
        // #endregion
        
        // Determine if this is an auth error or order submission error
        const isAuthError = error.config?.url === credentials.authUrl;
        const errorType = isAuthError ? "Authentication" : "Order Submission";
        
        // #region agent log
        // Log full error data without truncation - access properties directly
        const errorDataDirect = error.response?.data;
        if (errorDataDirect && typeof errorDataDirect === 'object') {
            const errorsArray = errorDataDirect.errors || [];
            errorsArray.forEach((err, idx) => {
                fetch('http://127.0.0.1:7242/ingest/b131dc2d-5624-4f61-98fb-efc543f7726a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'srsOrder.js:320',message:'FULL_ERROR_ITEM',data:{index:idx,domain:err.domain,reason:err.reason,message:err.message,messageLength:err.message?.length,parameter:err.parameter,field:err.field},timestamp:Date.now(),sessionId:'debug-session',runId:'run5',hypothesisId:'K'})}).catch(()=>{});
            });
        }
        fetch('http://127.0.0.1:7242/ingest/b131dc2d-5624-4f61-98fb-efc543f7726a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'srsOrder.js:327',message:'ERROR_ANALYSIS',data:{isAuthError,errorType,authUrl:credentials.authUrl,errorConfigUrl:error.config?.url,statusCode:error.response?.status,hasErrorData:!!error.response?.data,errorDataType:typeof error.response?.data},timestamp:Date.now(),sessionId:'debug-session',runId:'run5',hypothesisId:'A,B'})}).catch(()=>{});
        // #endregion
        
        // Extract detailed error information
        const statusCode = error.response?.status;
        let errorData = error.response?.data;
        
        // Handle case where errorData might be a string
        if (typeof errorData === 'string') {
            try {
                errorData = JSON.parse(errorData);
            } catch (e) {
                // Keep as string if not JSON
            }
        }
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/b131dc2d-5624-4f61-98fb-efc543f7726a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'srsOrder.js:280',message:'ERROR_DATA_EXTRACTION',data:{statusCode,errorDataType:typeof errorData,errorDataIsObject:typeof errorData==='object',errorDataKeys:errorData&&typeof errorData==='object'?Object.keys(errorData):null,errorDataString:typeof errorData==='string'?errorData.substring(0,200):null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        
        // Extract error message - SRS API uses 'message' field and 'errors' array
        let errorMessage = null;
        if (errorData && typeof errorData === 'object') {
            errorMessage = errorData.message || errorData.error || errorData.error_description || errorData.errorMessage;
            
            // #region agent log
            // Log each error individually to avoid truncation
            if (errorData.errors && Array.isArray(errorData.errors)) {
                errorData.errors.forEach((err, idx) => {
                    fetch('http://127.0.0.1:7242/ingest/b131dc2d-5624-4f61-98fb-efc543f7726a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'srsOrder.js:327',message:'ERROR_ITEM_DETAIL',data:{index:idx,domain:err.domain,reason:err.reason,message:err.message,parameter:err.parameter,field:err.field,fullError:err},timestamp:Date.now(),sessionId:'debug-session',runId:'run3',hypothesisId:'I'})}).catch(()=>{});
                });
            }
            fetch('http://127.0.0.1:7242/ingest/b131dc2d-5624-4f61-98fb-efc543f7726a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'srsOrder.js:332',message:'ERROR_EXTRACTION_BEFORE_ARRAY',data:{baseMessage:errorMessage,hasErrorsArray:!!errorData.errors,errorsArrayLength:errorData.errors?.length||0},timestamp:Date.now(),sessionId:'debug-session',runId:'run3',hypothesisId:'F'})}).catch(()=>{});
            // #endregion
            
            // If there's an errors array, append those messages for more detail
            if (errorData.errors && Array.isArray(errorData.errors) && errorData.errors.length > 0) {
                const errorDetails = errorData.errors.map((err, idx) => {
                    const domain = err.domain || 'unknown';
                    const msg = err.message || err.reason || 'error';
                    const param = err.parameter || err.field || '';
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/b131dc2d-5624-4f61-98fb-efc543f7726a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'srsOrder.js:340',message:'MAPPING_ERROR_ITEM',data:{idx,domain,msg,param,fullErr:err},timestamp:Date.now(),sessionId:'debug-session',runId:'run3',hypothesisId:'I'})}).catch(()=>{});
                    // #endregion
                    return param ? `${domain}.${param}: ${msg}` : `${domain}: ${msg}`;
                }).join('; ');
                
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/b131dc2d-5624-4f61-98fb-efc543f7726a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'srsOrder.js:347',message:'ERROR_DETAILS_EXTRACTED',data:{errorDetails,combinedMessage:errorMessage?`${errorMessage} (${errorDetails})`:errorDetails},timestamp:Date.now(),sessionId:'debug-session',runId:'run3',hypothesisId:'F'})}).catch(()=>{});
                // #endregion
                
                if (errorMessage) {
                    errorMessage += ` (${errorDetails})`;
                } else {
                    errorMessage = errorDetails;
                }
            }
        } else if (typeof errorData === 'string') {
            errorMessage = errorData;
        }
        
        // Fallback to axios error message if no structured error found
        errorMessage = errorMessage || error.message;
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/b131dc2d-5624-4f61-98fb-efc543f7726a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'srsOrder.js:356',message:'ERROR_MESSAGE_COMPLETE',data:{finalErrorMessage:errorMessage,errorMessageLength:errorMessage?.length||0},timestamp:Date.now(),sessionId:'debug-session',runId:'run3',hypothesisId:'F'})}).catch(()=>{});
        // #endregion
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/b131dc2d-5624-4f61-98fb-efc543f7726a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'srsOrder.js:290',message:'ERROR_MESSAGE_FINAL',data:{extractedMessage:errorMessage,fallbackMessage:error.message,usedFallback:errorMessage===error.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        
        console.error(`Error during SRS ${errorType}:`, {
            status: statusCode,
            message: errorMessage,
            url: error.config?.url,
            errorData: errorData,
            fullError: error.response?.data,
            credentials: {
                environment: credentials.environment,
                authUrl: credentials.authUrl,
                apiBaseUrl: credentials.apiBaseUrl,
                hasClientId: !!credentials.clientId,
                hasClientSecret: !!credentials.clientSecret,
                clientIdLength: credentials.clientId?.length || 0,
                clientSecretLength: credentials.clientSecret?.length || 0
            }
        });
        
        // For 400 errors, provide more context
        if (statusCode === 400) {
            const errorResponse = {
                success: false,
                message: `SRS ${errorType} failed`,
                error: errorMessage || "Bad Request - invalid credentials or request format",
                statusCode: statusCode,
                details: errorData,
                troubleshooting: isAuthError ? {
                    checkCredentials: "Verify SRS clientId and clientSecret are correct for this environment",
                    checkAuthUrl: `Verify authUrl is correct: ${credentials.authUrl}`,
                    checkEnvironment: `Current environment: ${credentials.environment}`,
                    commonIssues: [
                        "Credentials may be for wrong environment (prod vs sandbox)",
                        "Credentials may have whitespace or encoding issues",
                        "Auth URL may not match the environment",
                        "Client credentials may be expired or revoked"
                    ]
                } : {
                    checkPayload: "Verify order payload structure is correct",
                    checkToken: "Verify authentication token is valid"
                }
            };
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/b131dc2d-5624-4f61-98fb-efc543f7726a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'srsOrder.js:389',message:'RETURNING_400_ERROR',data:{errorType,errorMessage:errorMessage?.substring(0,200),errorField:errorResponse.error?.substring(0,200),errorFieldMatches:errorResponse.error===errorMessage,hasDetails:!!errorResponse.details,detailsKeys:errorResponse.details?Object.keys(errorResponse.details):null,fullErrorResponse:JSON.stringify(errorResponse).substring(0,500)},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'E'})}).catch(()=>{});
            // #endregion
            
            return errorResponse;
        }
        
        const errorResponse = {
            success: false,
            message: `SRS ${errorType} failed`,
            error: errorMessage || error.message,
            statusCode: statusCode || 500,
            details: errorData
        };
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/b131dc2d-5624-4f61-98fb-efc543f7726a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'srsOrder.js:353',message:'RETURNING_NON_400_ERROR',data:{errorType,errorMessage,statusCode,errorField:errorResponse.error},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
        
        return errorResponse;
    }
}