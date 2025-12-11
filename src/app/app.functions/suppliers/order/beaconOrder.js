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
    
    // Extract and validate address from multiple sources
    const address = extractAndValidateAddress(formatted, normalized, orderBody);
    
    // formatOrder returns object for BEACON (not array like ABC)
    // Use formatted values directly (formatOrder handles defaults from config)
    // Only use normalized as fallback if formatted doesn't have it and it's not in config defaults
    const payload = {
        accountId: formatted.accountId || normalized.accountNumber,
        apiSiteId: formatted.apiSiteId || (credentials.apiSiteId && credentials.apiSiteId.trim() !== "" ? credentials.apiSiteId : undefined),
        job: {
            checked: formatted.job?.checked,
            jobName: formatted.job?.jobName || normalized.jobName,
            jobNumber: formatted.job?.jobNumber || normalized.jobNumber
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

        // Step 2: Submit order with authentication
        const orderUrl = `${credentials.apiBaseUrl}/v1/rest/com/becn/submitOrder`;
        
        // Build payload dynamically based on environment and flags
        const payload = buildPayload(context, credentials, orderBody);
        
        // Log order payload before sending to supplier API
        logOrder(payload, "BEACON", "before sending to Beacon API");
        
        console.log("Submitting order to:", orderUrl);
        
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
            
            // Check for errors in response
            const orderData = orderResponse.data || {};
            const orderMessageCode = orderData.messageCode;
            const orderMessageInfo = orderData.messageInfo;
            
            if (orderMessageCode && orderMessageCode !== 0 && orderMessageCode !== 200) {
                console.error("Beacon order submission failed:", {
                    messageCode: orderMessageCode,
                    messageInfo: orderMessageInfo,
                    fullResponse: orderData
                });
                
                return {
                    success: false,
                    message: "Beacon order submission failed",
                    loginResponse: loginData,
                    cookiesCaptured: hasCookies,
                    cookieString: cookieString,
                    orderResponse: orderData,
                    error: orderMessageInfo || "Order submission failed",
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