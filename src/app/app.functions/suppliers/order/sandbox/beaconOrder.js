const axios = require("axios");
const https = require("https");
const { CookieJar } = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');

/**
 * Checks if URL requires SSL bypass (dev/UAT environments)
 * @param {string} url - The URL to check
 * @returns {boolean} True if SSL bypass is needed
 */
function needsSslBypass(url) {
    return url && (
        url.includes('beacon-dev.becn.com') || 
        url.includes('beacon-uat.becn.com')
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
    console.log("Placing Beacon sandbox order...");

    try {
        // Step 1: Authenticate and get cookies
        const beaconUsername = process.env.beaconUsername;
        const beaconPassword = process.env.beaconPass;
    
        if (!beaconUsername || !beaconPassword) {
            return {
                success: false,
                message: "Beacon credentials not configured",
                error: "Missing beaconUsername or beaconPass environment variables",
            };
        }
    
        const loginPayload = {
            username: beaconUsername,
            password: beaconPassword,
            siteId: "homeSite",
            persistentLoginType: "RememberMe",
            userAgent: "desktop",
            apiSiteId: "UAT", // UAT for sandbox/testing
        };
    
        const loginUrl = "https://beacon-dev.becn.com/v1/rest/com/becn/login";
        
        let loginResponse;
        let cookieString = null;
        
        // Use different approach for dev/UAT vs production
        if (needsSslBypass(loginUrl)) {
            console.log("Using dev/UAT mode: SSL bypass with manual cookie handling");
            console.log("Login URL:", loginUrl);
            const { client: devClient, httpsAgent } = createDevClient();
            
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
                console.log(`Captured cookies from login (dev/UAT mode)`);
            } else {
                console.warn("WARNING: No cookies found in login response");
            }
        } else {
            console.log("Using production mode: cookie-enabled client");
            const client = createCookieClient();
            
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
    
        return {
            success: true,
            message: "Beacon Login successful",
            loginResponse: loginResponse.data,
            cookiesCaptured: !!cookieString || loginResponse.headers['set-cookie']?.length > 0,
            cookieString: cookieString, // For dev/UAT, include cookie string for manual use
        };
    
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