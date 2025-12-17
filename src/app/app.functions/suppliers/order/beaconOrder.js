/**
 * Shape Language: Input → Filter → Transform → Store → Output → Loop
 * 
 * Input: Context with orderBody, optional environment
 * Filter: Validates credentials exist
 * Transform: Gets credentials from config, creates auth session, formats order
 * Store: N/A
 * Output: Order submission response from Beacon API
 * Loop: Self-healing - reads environment from order config if not provided
 */

const axios = require("axios");
const https = require("https");
const { CookieJar } = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');
const { formatOrder } = require("./formatOrder");
const { normalizeInput } = require("./normalizeInput");
const { getCredentials } = require("../config/getCredentials");
const { logOrder } = require("./logOrder");

/**
 * Build hardcoded test payload for Beacon sandbox testing
 * Maintains exact structure required by Beacon API
 */
function buildHardcodedTestPayload(orderBody) {
    return {
        "accountId": "557799", // Hardcoded - Should be dynamic
        "apiSiteId": "UAT", // Hardcoded - Related to "UAT" in auth?
        "job": {
          "checked": false, // Default
          // Truncate deal_object_id to ensure jobName is <= 15 characters
          "jobName": `DEAL-001-TEST`, // Add order number to job name
          // Ensure the random part is always a single digit (0-9)
          //"jobNumber": `${String(orderInfo.deal_object_id).slice(-5)}-${Math.floor(Math.random()*10)}`
          "jobNumber": "999"
        },
        "purchaseOrderNo": `TEST-PO-001`, // Unique PO
        "lineItems": [
            {
                "itemNumber": "315692",
                "quantity": 1,
                "unitOfMeasure": "EA",
                "description": "Test Order",
                "lineComments": "This is a test order. Please void.",
                "productNumber": "315692"
            }
        ],
        "shipping": {
          "shippingMethod": "D", // Default to 'D' (Delivery)
          "shippingBranch": "300", // Hardcoded - Should be dynamic
          "address": {
            "address1": `${orderBody?.delivery?.address_line_1 || "Test Street 1"}`,
            "address2": `${orderBody?.delivery?.address_line_2 || ""}`,
            "address3": null,
            "city": `${orderBody?.delivery?.city || "City 1"}`,
            "postalCode": `${orderBody?.delivery?.zip_code || "12345"}`,
            "state": `${orderBody?.delivery?.state || "CA"}`,
            "country": "USA"
          }
        },
        "specialInstruction": "This is a test order. Please void. " + (orderBody?.delivery?.notes || ""),
        "pickupDate": `${orderBody?.delivery?.date || ""}`, // Ensure this format is correct for Beacon
        "pickupTime": `${orderBody?.delivery?.time || "Anytime"}`, // Default if missing
    };
}

/**
 * Extract and validate address from multiple sources
 * Priority: formatted.deliveryAddress → normalized.delivery.address → orderBody.delivery
 * Ensures address1 is never empty (required by Beacon API)
 */
function extractAndValidateAddress(formatted, normalized, orderBody) {
    // Try formatted.deliveryAddress first (from formatOrder mapping)
    let address1 = formatted.deliveryAddress?.line1 || 
                   formatted.shipping?.address?.address1 || "";
    
    let address2 = formatted.deliveryAddress?.line2 || 
                   formatted.shipping?.address?.address2 || "";
    
    let city = formatted.deliveryAddress?.city || 
               formatted.shipping?.address?.city || "";
    
    let state = formatted.deliveryAddress?.state || 
                formatted.shipping?.address?.state || "";
    
    let postalCode = formatted.deliveryAddress?.postalCode || 
                     formatted.shipping?.address?.postalCode || "";
    
    // Fallback to normalized delivery address if formatted doesn't have it
    if (!address1) {
        address1 = normalized?.delivery?.address?.line1 || "";
    }
    if (!address2) {
        address2 = normalized?.delivery?.address?.line2 || "";
    }
    if (!city) {
        city = normalized?.delivery?.address?.city || "";
    }
    if (!state) {
        state = normalized?.delivery?.address?.state || "";
    }
    if (!postalCode) {
        postalCode = normalized?.delivery?.address?.postalCode || "";
    }
    
    // Final fallback to orderBody delivery (deal properties)
    if (!address1) {
        address1 = orderBody?.delivery?.address_line_1 || 
                   orderBody?.delivery?.address?.line1 || 
                   orderBody?.addressSnapshot?.address_line_1 || "";
    }
    if (!address2) {
        address2 = orderBody?.delivery?.address_line_2 || 
                   orderBody?.delivery?.address?.line2 || "";
    }
    if (!city) {
        city = orderBody?.delivery?.city || 
              orderBody?.addressSnapshot?.city || "";
    }
    if (!state) {
        state = orderBody?.delivery?.state || 
                orderBody?.addressSnapshot?.state || "";
    }
    if (!postalCode) {
        postalCode = orderBody?.delivery?.zip_code || 
                     orderBody?.delivery?.address?.postalCode || 
                     orderBody?.addressSnapshot?.zip_code || "";
    }
    
    // Validate address1 is not empty (Beacon requirement)
    // If still empty, log warning and use placeholder (order will likely fail but won't crash)
    if (!address1 || address1.trim() === "") {
        console.warn("⚠️ Beacon address1 is empty - order may be rejected by Beacon API");
        console.warn("Address sources checked:", {
            formattedDeliveryAddress: formatted.deliveryAddress?.line1,
            formattedShippingAddress: formatted.shipping?.address?.address1,
            normalizedDelivery: normalized?.delivery?.address?.line1,
            orderBodyDelivery: orderBody?.delivery?.address_line_1,
            orderBodyAddressSnapshot: orderBody?.addressSnapshot?.address_line_1
        });
        // Don't set empty string - let Beacon reject with clear error message
        // This helps identify missing address data
    }
    
    return {
        address1: address1.trim(),
        address2: address2.trim(),
        address3: null, // Beacon uses null for address3
        city: city.trim(),
        postalCode: postalCode.trim(),
        state: state.trim(),
        country: "USA" // Default to USA
    };
}

/**
 * Build payload dynamically based on environment and parameters
 * Maintains EXACT same structure as hardcoded version
 */
function buildPayload(context, credentials, orderBody) {
    const { useTestPayload } = context.parameters || {};
    const isSandbox = credentials.environment === "sandbox";
    
    // Flag-based test payload: Only use hardcoded test if explicitly enabled
    // Default: false (use real order data) for both sandbox and production
    // Set useTestPayload=true to use hardcoded test payload
    if (useTestPayload === true) {
        return buildHardcodedTestPayload(orderBody);
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
    
    const formatted = formatOrder(normalized, "BEACON", credentials.environment);
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/b131dc2d-5624-4f61-98fb-efc543f7726a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'beaconOrder.js:185',message:'AFTER_FORMAT_ORDER',data:{hasFormatted:!!formatted,formattedKeys:formatted?Object.keys(formatted):[],formattedAccountId:formatted?.accountId,formattedAccountNumber:formatted?.accountNumber,normalizedAccountNumber:normalized?.accountNumber,orderBodyAccountNumber:orderBody?.accountNumber},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H2,H3'})}).catch(()=>{});
    // #endregion
    
    // Extract and validate address from multiple sources
    const address = extractAndValidateAddress(formatted, normalized, orderBody);
    
    // formatOrder returns object for BEACON (not array like ABC)
    // Use formatted values directly (formatOrder handles defaults from config)
    // Only use normalized as fallback if formatted doesn't have it and it's not in config defaults
    // Config maps accountNumber to accountId, so formatted.accountId should be set
    const accountIdValue = formatted.accountId || formatted.accountNumber || normalized.accountNumber || orderBody.accountNumber || '';
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/b131dc2d-5624-4f61-98fb-efc543f7726a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'beaconOrder.js:194',message:'ACCOUNT_ID_RESOLUTION',data:{accountIdValue,hasAccountId:!!accountIdValue,accountIdLength:accountIdValue?.length||0,formattedAccountId:formatted?.accountId,formattedAccountNumber:formatted?.accountNumber,normalizedAccountNumber:normalized?.accountNumber,orderBodyAccountNumber:orderBody?.accountNumber,formattedKeys:formatted?Object.keys(formatted):[]},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H2,H3'})}).catch(()=>{});
    // #endregion
    
    // Validate accountId is not empty (Beacon API requirement)
    if (!accountIdValue || accountIdValue.trim() === '') {
        const errorMsg = 'accountId is required for Beacon orders. Ensure accountNumber is set in the order.';
        console.error('❌', errorMsg);
        console.error('Account ID resolution sources:', {
            formattedAccountId: formatted?.accountId,
            formattedAccountNumber: formatted?.accountNumber,
            normalizedAccountNumber: normalized?.accountNumber,
            orderBodyAccountNumber: orderBody?.accountNumber,
            formattedKeys: formatted ? Object.keys(formatted) : []
        });
        throw new Error(errorMsg);
    }
    
    // Resolve jobNumber with fallback - Beacon API requires this field
    // Check each source and use first non-empty value, or default to '999'
    const formattedJobNumber = formatted.job?.jobNumber;
    const normalizedJobNumber = normalized.jobNumber;
    const orderBodyJobNumber = orderBody.jobNumber;
    
    // Helper to check if value is non-empty
    const isNonEmpty = (val) => val !== undefined && val !== null && String(val).trim() !== '';
    
    // Find first non-empty value
    let jobNumberValue = '';
    if (isNonEmpty(formattedJobNumber)) {
        jobNumberValue = String(formattedJobNumber).trim();
    } else if (isNonEmpty(normalizedJobNumber)) {
        jobNumberValue = String(normalizedJobNumber).trim();
    } else if (isNonEmpty(orderBodyJobNumber)) {
        jobNumberValue = String(orderBodyJobNumber).trim();
    }
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/b131dc2d-5624-4f61-98fb-efc543f7726a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'beaconOrder.js:219',message:'JOB_NUMBER_RESOLUTION',data:{jobNumberValue,hasJobNumber:isNonEmpty(jobNumberValue),formattedJobNumber,normalizedJobNumber,orderBodyJobNumber,formattedJobNumberType:typeof formattedJobNumber},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'BEACON_ERROR'})}).catch(()=>{});
    // #endregion
    
    // If jobNumber is still empty, use default (Beacon API requirement)
    const finalJobNumber = isNonEmpty(jobNumberValue) ? jobNumberValue : '999';
    
    if (!isNonEmpty(jobNumberValue)) {
        console.warn('⚠️ jobNumber is empty - using default fallback: 999');
        console.warn('JobNumber sources:', {
            formattedJobNumber: formattedJobNumber,
            normalizedJobNumber: normalizedJobNumber,
            orderBodyJobNumber: orderBodyJobNumber,
            allEmpty: true
        });
    } else {
        console.log('✅ jobNumber resolved:', finalJobNumber);
    }
    
    // Ensure jobNumber is always set (Beacon API requirement)
    console.log('🔍 JobNumber resolution:', {
        formattedJobNumber: formatted.job?.jobNumber,
        normalizedJobNumber: normalized.jobNumber,
        orderBodyJobNumber: orderBody.jobNumber,
        jobNumberValue: jobNumberValue,
        finalJobNumber: finalJobNumber
    });
    
    // CRITICAL: Ensure finalJobNumber is never empty (Beacon API rejects empty string)
    const safeJobNumber = (finalJobNumber && String(finalJobNumber).trim() !== '') ? String(finalJobNumber).trim() : '999';
    
    console.log('🔍 Final jobNumber check:', {
        finalJobNumber: finalJobNumber,
        finalJobNumberType: typeof finalJobNumber,
        safeJobNumber: safeJobNumber,
        willUseDefault: safeJobNumber === '999'
    });
    
    const payload = {
        accountId: accountIdValue.trim(),
        apiSiteId: formatted.apiSiteId || (credentials.apiSiteId && credentials.apiSiteId.trim() !== "" ? credentials.apiSiteId : undefined),
        job: {
            checked: formatted.job?.checked !== undefined ? formatted.job.checked : false,
            jobName: formatted.job?.jobName || normalized.jobName || '',
            jobNumber: safeJobNumber // ALWAYS non-empty - either from data or default '999'
        },
        purchaseOrderNo: formatted.purchaseOrderNo || normalized.poNumber || `PO-${Date.now()}`,
        lineItems: formatted.lineItems || [],
        shipping: {
            shippingMethod: formatted.shipping?.shippingMethod,
            shippingBranch: formatted.shipping?.shippingBranch || normalized.branchId,
            address: address
        },
        specialInstruction: formatted.specialInstruction || normalized.delivery?.notes || "",
        pickupDate: formatted.pickupDate || normalized.delivery?.date || "",
        pickupTime: formatted.pickupTime || normalized.delivery?.timeCode
    };
    
    // Only include apiSiteId if it's configured and not empty (from credentials or formatted)
    if (payload.apiSiteId && payload.apiSiteId.trim() !== "") {
        // Already set above
    } else if (credentials.apiSiteId && credentials.apiSiteId.trim() !== "") {
        payload.apiSiteId = credentials.apiSiteId;
    }
    
    // CRITICAL: Final safety check - ensure job.jobNumber is ALWAYS set and non-empty (Beacon API requirement)
    if (!payload.job) {
        console.error('❌ CRITICAL: payload.job is missing! Creating job object.');
        payload.job = { checked: false, jobName: '', jobNumber: '999' };
    } else {
        // Force jobNumber to be non-empty string
        const currentJobNumber = payload.job.jobNumber;
        if (!currentJobNumber || String(currentJobNumber).trim() === '') {
            console.error('❌ CRITICAL: payload.job.jobNumber is empty or missing! Current value:', currentJobNumber, 'Type:', typeof currentJobNumber);
            payload.job.jobNumber = '999';
            console.log('✅ Forced job.jobNumber to default: 999');
        } else {
            // Ensure it's a string and trimmed
            payload.job.jobNumber = String(currentJobNumber).trim();
            console.log('✅ job.jobNumber is valid:', payload.job.jobNumber);
        }
    }
    
    // Final verification log
    console.log('🔍 Final payload.job verification BEFORE validation:', JSON.stringify(payload.job, null, 2));
    
    // ABSOLUTE FINAL CHECK - ensure jobNumber is never empty (this should never trigger if code is correct)
    if (payload.job && (!payload.job.jobNumber || String(payload.job.jobNumber).trim() === '')) {
        console.error('❌❌❌ CRITICAL: job.jobNumber is STILL empty after all checks! Forcing to 999');
        payload.job.jobNumber = '999';
    }
    
    // Validate payload before returning
    const validationErrors = [];
    if (!payload.accountId || payload.accountId.trim() === '') {
        validationErrors.push('accountId is required');
    }
    if (!payload.lineItems || payload.lineItems.length === 0) {
        validationErrors.push('lineItems array is required and cannot be empty');
    } else {
        // Validate each line item has required fields for Beacon
        payload.lineItems.forEach((item, index) => {
            if (!item.itemNumber || String(item.itemNumber).trim() === '') {
                validationErrors.push(`lineItems[${index}].itemNumber is required`);
            }
            if (!item.unitOfMeasure || String(item.unitOfMeasure).trim() === '') {
                validationErrors.push(`lineItems[${index}].unitOfMeasure is required`);
            }
            if (!item.productNumber || String(item.productNumber).trim() === '') {
                validationErrors.push(`lineItems[${index}].productNumber is required`);
            }
            if (item.quantity === undefined || item.quantity === null) {
                validationErrors.push(`lineItems[${index}].quantity is required`);
            }
        });
    }
    if (!payload.shipping || !payload.shipping.address || !payload.shipping.address.address1 || payload.shipping.address.address1.trim() === '') {
        validationErrors.push('shipping.address.address1 is required');
    }
    if (!payload.job || !payload.job.jobNumber || payload.job.jobNumber.trim() === '') {
        validationErrors.push('job.jobNumber is required');
    }
    
    // Final safety check - if jobNumber is still missing, force it
    if (validationErrors.length === 0 && (!payload.job.jobNumber || payload.job.jobNumber.trim() === '')) {
        console.error('❌ CRITICAL: job.jobNumber validation passed but value is still empty! Forcing default.');
        payload.job.jobNumber = '999';
    }
    
    if (validationErrors.length > 0) {
        console.error('❌ Beacon payload validation failed:', validationErrors);
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/b131dc2d-5624-4f61-98fb-efc543f7726a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'beaconOrder.js:245',message:'BEACON_PAYLOAD_VALIDATION_FAILED',data:{validationErrors,payloadKeys:Object.keys(payload),hasAccountId:!!payload.accountId,hasLineItems:!!payload.lineItems,lineItemsCount:payload.lineItems?.length||0,hasShippingAddress:!!payload.shipping?.address,addressLine1:payload.shipping?.address?.address1},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'BEACON_ERROR'})}).catch(()=>{});
        // #endregion
        throw new Error(`Beacon payload validation failed: ${validationErrors.join(', ')}`);
    }
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/b131dc2d-5624-4f61-98fb-efc543f7726a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'beaconOrder.js:300',message:'BEACON_PAYLOAD_VALIDATED',data:{hasAccountId:!!payload.accountId,hasLineItems:!!payload.lineItems,lineItemsCount:payload.lineItems?.length||0,hasShippingAddress:!!payload.shipping?.address,addressLine1:payload.shipping?.address?.address1,hasJob:!!payload.job,hasJobNumber:!!payload.job?.jobNumber,jobNumber:payload.job?.jobNumber,jobNumberType:typeof payload.job?.jobNumber,payloadKeys:Object.keys(payload),jobKeys:payload.job?Object.keys(payload.job):[]},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'BEACON_ERROR'})}).catch(()=>{});
    // #endregion
    
    // Final verification - log the exact payload structure
    console.log('✅ Final payload job object:', JSON.stringify(payload.job, null, 2));
    
    return payload;
}

/**
 * Checks if URL requires SSL bypass (dev/UAT environments)
 * @param {string} url - The URL to check
 * @returns {boolean} True if SSL bypass is needed
 */
function needsSslBypass(url) {
    return url && (
        url.includes('beacon-dev.becn.com') || 
        url.includes('beacon-uat.becn.com') ||
        url.includes('uat-api.qxo.com')
    );
}

/**
 * Creates a cookie-enabled axios client for production (no SSL bypass)
 * @returns {axios.AxiosInstance} Cookie-enabled axios client
 */
function createCookieClient() {
    const jar = new CookieJar();
    const instance = axios.create({
        jar: jar,
        withCredentials: true,
        timeout: 30000
    });
    const client = wrapper(instance);
    client.defaults.jar = jar;
    client.defaults.withCredentials = true;
    return client;
}

/**
 * Creates an axios instance with SSL bypass for dev/UAT (manual cookie handling)
 * @returns {object} Object with axios instance and httpsAgent
 */
function createDevClient() {
    // Create a more permissive HTTPS agent for dev/UAT
    const httpsAgent = new https.Agent({
        rejectUnauthorized: false, // ⚠️ DEV/UAT ONLY - bypass certificate validation
        keepAlive: false,
        // Additional options to help with problematic SSL connections
        maxSockets: 1,
        maxFreeSockets: 1,
    });
    
    console.log("Created HTTPS agent with SSL bypass:", {
        rejectUnauthorized: httpsAgent.options.rejectUnauthorized,
        keepAlive: httpsAgent.options.keepAlive
    });
    
    const client = axios.create({
        timeout: 60000, // Increased timeout for dev environments
        withCredentials: true,
    });
    
    // Set agent on defaults
    client.defaults.httpsAgent = httpsAgent;
    
    return {
        client: client,
        httpsAgent: httpsAgent
    };
}

/**
 * Extracts cookies from response headers and formats as cookie string
 * @param {object} response - Axios response object
 * @returns {string} Cookie string for Cookie header
 */
function extractCookies(response) {
    const rawCookies = response.headers['set-cookie'];
    if (!rawCookies || rawCookies.length === 0) {
        return null;
    }
    // Extract cookie name=value pairs (before first semicolon)
    return rawCookies
        .map(cookie => cookie.split(';')[0])
        .join('; ');
}

exports.main = async (context = {}) => {
    // Get environment from context or read from config
    const environment = context.parameters?.environment || null;
    const credentials = getCredentials("BEACON", environment);

    console.log(`Placing Beacon order (${credentials.environment})...`);

    try {
        const { orderBody } = context.parameters || {};
        
        // Step 1: Authenticate and get cookies
        if (!credentials.username || !credentials.password) {
            return {
                success: false,
                message: "Beacon credentials not configured",
                error: `Missing Beacon credentials for environment: ${credentials.environment}`,
            };
        }
    
        const loginPayload = {
            username: credentials.username,
            password: credentials.password,
            siteId: "homeSite",
            persistentLoginType: "RememberMe",
            userAgent: "desktop",
        };

        // Only include apiSiteId if it's configured and not empty
        if (credentials.apiSiteId && credentials.apiSiteId.trim() !== "") {
            loginPayload.apiSiteId = credentials.apiSiteId;
        }
    
        const loginUrl = credentials.authUrl;
        
        let loginResponse;
        let cookieString = null;
        let authenticatedClient = null; // Store the authenticated client for order submission
        let httpsAgent = null; // Store httpsAgent for order submission
        
        // Use different approach for dev/UAT vs production
        if (needsSslBypass(loginUrl)) {
            console.log("Using dev/UAT mode: SSL bypass with manual cookie handling");
            console.log("Login URL:", loginUrl);
            const { client: devClient, httpsAgent: devHttpsAgent } = createDevClient();
            authenticatedClient = devClient;
            httpsAgent = devHttpsAgent;
            
            // Login request with SSL bypass
            console.log("Making login request with SSL bypass...");
            try {
                loginResponse = await devClient({
                    method: "post",
                    url: loginUrl,
                    data: loginPayload,
                    headers: {
                        "Content-Type": "application/json",
                    },
                    httpsAgent: httpsAgent, // Explicitly pass agent
                    validateStatus: function (status) {
                        return status >= 200 && status < 500; // Accept any status < 500
                    },
                });
                console.log("Login response status:", loginResponse.status);
            } catch (requestError) {
                console.error("Request error details:", {
                    message: requestError.message,
                    code: requestError.code,
                    errno: requestError.errno,
                    syscall: requestError.syscall,
                    address: requestError.address,
                    port: requestError.port,
                });
                throw requestError;
            }
            
            // Manually extract cookies from response headers
            cookieString = extractCookies(loginResponse);
            if (cookieString) {
                console.log(`Captured cookies from login (dev/UAT mode): ${cookieString.substring(0, 50)}...`);
            } else {
                console.warn("WARNING: No cookies found in login response");
            }
        } else {
            console.log("Using production mode: cookie-enabled client");
            const client = createCookieClient();
            authenticatedClient = client; // Store for order submission
            
            // Login request - cookies automatically captured by CookieJar
            loginResponse = await client({
                method: "post",
                url: loginUrl,
                data: loginPayload,
                headers: {
                    "Content-Type": "application/json",
                },
            });
            
            // Verify cookies were captured
            const cookies = await client.defaults.jar.getCookies(loginUrl);
            console.log(`Captured ${cookies.length} cookie(s) from login (production mode)`);
            if (cookies.length === 0) {
                console.warn("WARNING: No cookies captured - authentication may fail for subsequent requests");
            }
        }
    
        // Check if login was actually successful
        // Beacon API returns error messages in response body even with 200 status
        const loginData = loginResponse.data || {};
        const messageCode = loginData.messageCode;
        const messageInfo = loginData.messageInfo;
        
        // Check for error codes (non-zero messageCode indicates error)
        if (messageCode && messageCode !== 0 && messageCode !== 200) {
            console.error("Beacon login failed:", {
                messageCode: messageCode,
                messageInfo: messageInfo,
                fullResponse: loginData
            });
            
            return {
                success: false,
                message: "Beacon Login failed",
                error: messageInfo || "Login authentication failed",
                messageCode: messageCode,
                loginResponse: loginData,
                cookiesCaptured: false,
                cookieString: null
            };
        }
        
        // Verify cookies were actually captured
        const hasCookies = !!cookieString || loginResponse.headers['set-cookie']?.length > 0;
        
        if (!hasCookies) {
            console.warn("WARNING: Login may have succeeded but no cookies were captured");
            return {
                success: false,
                message: "Beacon Login successful but no cookies captured",
                loginResponse: loginData,
                cookiesCaptured: false,
                error: "Cannot submit order without authentication cookies"
            };
        }

        // Step 2: Extract accountId from login response if not in orderBody
        // Beacon login response contains accountLegacyId in lastSelectedAccount
        const accountIdFromLogin = loginData?.messageInfo?.lastSelectedAccount?.accountLegacyId;
        if (accountIdFromLogin && (!orderBody?.accountNumber && !orderBody?.accountId)) {
            console.log(`Extracting accountId from Beacon login response: ${accountIdFromLogin}`);
            // Add to orderBody so buildPayload can use it
            if (!orderBody) orderBody = {};
            orderBody.accountNumber = accountIdFromLogin;
        }
        
        // Step 3: Submit order with authentication
        const orderUrl = `${credentials.apiBaseUrl}/v1/rest/com/becn/submitOrder`;
        
        // Build payload dynamically based on environment and flags
        const payload = buildPayload(context, credentials, orderBody);
        
        // CRITICAL: Ensure line items have required Beacon fields
        if (payload.lineItems && Array.isArray(payload.lineItems)) {
            payload.lineItems = payload.lineItems.map((item) => {
                // Ensure productNumber exists (required by Beacon - same as itemNumber)
                if (!item.productNumber) {
                    item.productNumber = item.itemNumber || '';
                }
                // Ensure unitOfMeasure exists (required by Beacon - not 'uom')
                if (!item.unitOfMeasure && item.uom) {
                    item.unitOfMeasure = item.uom;
                    delete item.uom; // Remove 'uom' if it exists
                }
                if (!item.unitOfMeasure) {
                    item.unitOfMeasure = 'EA'; // Default fallback
                }
                return item;
            });
        }
        
        // If accountId is still missing, inject it from login response
        if (!payload.accountId && accountIdFromLogin) {
            console.log(`Injecting accountId from login response into payload: ${accountIdFromLogin}`);
            payload.accountId = accountIdFromLogin;
        }
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/b131dc2d-5624-4f61-98fb-efc543f7726a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'beaconOrder.js:475',message:'PAYLOAD_BEFORE_SUBMIT',data:{hasAccountId:!!payload.accountId,accountId:payload.accountId,accountIdFromLogin,orderBodyAccountNumber:orderBody?.accountNumber},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H2,H3'})}).catch(()=>{});
        // #endregion
        
        // Log order payload before sending to supplier API
        logOrder(payload, "BEACON", "before sending to Beacon API");
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/b131dc2d-5624-4f61-98fb-efc543f7726a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'beaconOrder.js:498',message:'BEACON_PAYLOAD_BEFORE_SUBMIT',data:{hasAccountId:!!payload.accountId,accountId:payload.accountId,hasLineItems:!!payload.lineItems,lineItemsCount:payload.lineItems?.length||0,hasShipping:!!payload.shipping,hasAddress:!!payload.shipping?.address,addressLine1:payload.shipping?.address?.address1,hasJob:!!payload.job,jobName:payload.job?.jobName,jobNumber:payload.job?.jobNumber,hasJobNumber:!!payload.job?.jobNumber,hasPurchaseOrderNo:!!payload.purchaseOrderNo,payloadKeys:Object.keys(payload)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'BEACON_ERROR'})}).catch(()=>{});
        // #endregion
        
        // CRITICAL: Final safety check - ensure job.jobNumber exists before API call
        if (!payload.job) {
            console.error('❌ CRITICAL: payload.job is missing! Creating job object.');
            payload.job = { checked: false, jobName: '', jobNumber: '999' };
        }
        if (!payload.job.jobNumber || payload.job.jobNumber.trim() === '') {
            console.error('❌ CRITICAL: payload.job.jobNumber is missing or empty right before API call! Forcing default: 999');
            payload.job.jobNumber = '999';
        }
        
        console.log("Submitting order to:", orderUrl);
        console.log("Payload structure:", {
            hasAccountId: !!payload.accountId,
            accountId: payload.accountId,
            hasLineItems: !!payload.lineItems,
            lineItemsCount: payload.lineItems?.length || 0,
            hasShipping: !!payload.shipping,
            hasAddress: !!payload.shipping?.address,
            addressLine1: payload.shipping?.address?.address1,
            hasJob: !!payload.job,
            jobChecked: payload.job?.checked,
            jobName: payload.job?.jobName,
            jobNumber: payload.job?.jobNumber,
            jobNumberType: typeof payload.job?.jobNumber,
            jobNumberLength: payload.job?.jobNumber?.length,
            hasJobNumber: !!payload.job?.jobNumber && payload.job.jobNumber.trim() !== '',
            hasPurchaseOrderNo: !!payload.purchaseOrderNo
        });
        
        // Log the full job object to verify structure
        console.log("🔍 Full job object:", JSON.stringify(payload.job, null, 2));
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/b131dc2d-5624-4f61-98fb-efc543f7726a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'beaconOrder.js:575',message:'FULL_PAYLOAD_STRUCTURE',data:{hasJob:!!payload.job,jobObject:payload.job,jobNumber:payload.job?.jobNumber,jobNumberType:typeof payload.job?.jobNumber,fullPayloadKeys:Object.keys(payload)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'BEACON_ERROR'})}).catch(()=>{});
        // #endregion
        
        // Log the exact payload being sent to Beacon API
        console.log("📤 EXACT PAYLOAD BEING SENT TO BEACON API:");
        console.log(JSON.stringify(payload, null, 2));
        
        let orderResponse;
        
        try {
            if (needsSslBypass(orderUrl)) {
                // Use the same authenticated client with SSL bypass and cookie string
                console.log("Submitting order with SSL bypass and cookies...");
                orderResponse = await authenticatedClient({
                    method: "post",
                    url: orderUrl,
                    data: payload,
                    headers: {
                        "Content-Type": "application/json",
                        ...(cookieString && { "Cookie": cookieString })
                    },
                    httpsAgent: httpsAgent,
                    validateStatus: function (status) {
                        return status >= 200 && status < 500;
                    },
                });
            } else {
                // Use the authenticated cookie-enabled client (production)
                console.log("Submitting order with cookie-enabled client...");
                orderResponse = await authenticatedClient({
                    method: "post",
                    url: orderUrl,
                    data: payload,
                    headers: {
                        "Content-Type": "application/json",
                    },
                });
            }
            
            console.log("Order Response Status:", orderResponse.status);
            console.log("Order Response:", JSON.stringify(orderResponse.data, null, 2));
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/b131dc2d-5624-4f61-98fb-efc543f7726a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'beaconOrder.js:534',message:'BEACON_ORDER_RESPONSE',data:{status:orderResponse.status,hasData:!!orderResponse.data,dataKeys:orderResponse.data?Object.keys(orderResponse.data):[],fullResponse:JSON.stringify(orderResponse.data).substring(0,1000)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'BEACON_ERROR'})}).catch(()=>{});
            // #endregion
            
            // Check for errors in response
            const orderData = orderResponse.data || {};
            const orderMessageCode = orderData.messageCode;
            const orderMessageInfo = orderData.messageInfo;
            const orderResult = orderData.result;
            const orderMessage = orderData.message;
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/b131dc2d-5624-4f61-98fb-efc543f7726a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'beaconOrder.js:542',message:'BEACON_ERROR_CHECK',data:{messageCode:orderMessageCode,hasMessageInfo:!!orderMessageInfo,messageInfo:orderMessageInfo,hasResult:!!orderResult,result:orderResult,hasMessage:!!orderMessage,message:orderMessage,isError:orderMessageCode&&orderMessageCode!==0&&orderMessageCode!==200},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'BEACON_ERROR'})}).catch(()=>{});
            // #endregion
            
            if (orderMessageCode && orderMessageCode !== 0 && orderMessageCode !== 200) {
                console.error("Beacon order submission failed:", {
                    messageCode: orderMessageCode,
                    messageInfo: orderMessageInfo,
                    message: orderMessage,
                    result: orderResult,
                    fullResponse: orderData
                });
                
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/b131dc2d-5624-4f61-98fb-efc543f7726a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'beaconOrder.js:549',message:'BEACON_ORDER_FAILED',data:{messageCode:orderMessageCode,messageInfo:orderMessageInfo,message:orderMessage,result:orderResult,fullResponseKeys:Object.keys(orderData)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'BEACON_ERROR'})}).catch(()=>{});
                // #endregion
                
                return {
                    success: false,
                    message: "Beacon order submission failed",
                    loginResponse: loginData,
                    cookiesCaptured: hasCookies,
                    cookieString: cookieString,
                    orderResponse: orderData,
                    error: orderMessageInfo || orderMessage || "Order submission failed",
                    messageCode: orderMessageCode
                };
            }
            
            // Also check if result is null (Beacon API sometimes returns result: null on error)
            if (orderResult === null && orderMessageCode) {
                console.error("Beacon order submission failed - result is null:", {
                    messageCode: orderMessageCode,
                    messageInfo: orderMessageInfo,
                    message: orderMessage,
                    fullResponse: orderData
                });
                
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/b131dc2d-5624-4f61-98fb-efc543f7726a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'beaconOrder.js:570',message:'BEACON_ORDER_FAILED_NULL_RESULT',data:{messageCode:orderMessageCode,messageInfo:orderMessageInfo,message:orderMessage},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'BEACON_ERROR'})}).catch(()=>{});
                // #endregion
                
                return {
                    success: false,
                    message: "Beacon order submission failed",
                    loginResponse: loginData,
                    cookiesCaptured: hasCookies,
                    cookieString: cookieString,
                    orderResponse: orderData,
                    error: orderMessageInfo || orderMessage || "Order submission failed - result is null",
                    messageCode: orderMessageCode
                };
            }
            
            return {
                success: true,
                message: `Beacon order submitted successfully (${credentials.environment})`,
                loginResponse: loginData,
                cookiesCaptured: hasCookies,
                cookieString: cookieString,
                environment: credentials.environment,
                orderResponse: orderData
            };
            
        } catch (orderError) {
            console.error("Error submitting order:", {
                message: orderError.message,
                response: orderError.response?.data,
                status: orderError.response?.status,
                headers: orderError.response?.headers
            });
            
            return {
                success: false,
                message: "Beacon order submission failed",
                loginResponse: loginData,
                cookiesCaptured: hasCookies,
                cookieString: cookieString,
                error: orderError.response?.data || orderError.message,
                status: orderError.response?.status
            };
        }
    
    } catch (error) {
        // Enhanced error logging for SSL/TLS issues
        const errorMessage = error.message || "Unknown error";
        const isSslError =
            errorMessage.includes("TLS") ||
            errorMessage.includes("SSL") ||
            errorMessage.includes("certificate") ||
            errorMessage.includes("socket disconnected");
    
        if (isSslError) {
            console.error("SSL/TLS Error detected:", errorMessage);
            console.error(
                "If using dev URL, ensure SSL bypass is configured correctly"
            );
        }
    
        console.error(
            "Error during Beacon order:",
            error.response?.data || errorMessage
        );
    
        return {
            success: false,
            message: "Beacon order failed",
            error: error.response?.data || errorMessage,
            ...(isSslError && {
                sslError: true,
                note: "SSL/TLS connection issue detected",
            }),
        };
    }
}