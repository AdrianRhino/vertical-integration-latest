const axios = require("axios");
const https = require("https");
const { CookieJar } = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');

// Create cookie jar and axios instance with cookie support (for production)
const jar = new CookieJar();
const client = wrapper(axios.create({ jar }));
client.defaults.jar = jar;
client.defaults.withCredentials = true;

/**
 * Creates an axios instance with SSL bypass for dev environments
 * WARNING: This bypasses SSL certificate validation - USE ONLY FOR DEV/TESTING
 * Note: Cannot use with axios-cookiejar-support wrapper, so we use regular axios
 * and manually handle cookies if needed
 * @param {string} url - The URL to check if SSL bypass is needed
 * @returns {axios.AxiosInstance} Axios instance configured for the URL
 */
function createAxiosInstance(url) {
    // Only bypass SSL for dev URLs - keep production secure
    if (url && url.includes('beacon-dev.becn.com')) {
        console.log("WARNING: Using SSL bypass for dev environment - testing only");
        // Create HTTPS agent with minimal SSL bypass configuration
        // Using minimal options to avoid connection issues
        const httpsAgent = new https.Agent({
            rejectUnauthorized: false, // Bypass SSL certificate validation for dev
            keepAlive: false, // Disable keep-alive to avoid connection reuse issues
        });
        
        console.log("Created HTTPS agent with SSL bypass for dev URL:", url);
        console.log("HTTPS Agent config:", {
            rejectUnauthorized: httpsAgent.options.rejectUnauthorized,
            keepAlive: httpsAgent.options.keepAlive
        });
        
        // Create axios instance with custom HTTPS agent for dev
        const instance = axios.create({
            httpsAgent: httpsAgent,
            timeout: 30000 // 30 second timeout
        });
        
        // Verify the agent is set
        console.log("Axios instance created, httpsAgent set:", !!instance.defaults.httpsAgent);
        
        return instance;
    }
    // Use regular axios for production (or wrapped client if cookies needed)
    return axios;
}

exports.main = async (context = {}) => {
    console.log("Placing Beacon sandbox order...");

    try {
        // Dev-only: bypass SSL validation for beacon-dev.becn.com
        const httpsAgent = new https.Agent({
            rejectUnauthorized: false, // ⚠️ DEV ONLY – do NOT use this in prod
        });
    
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
    
        const loginResponse = await axios({
            method: "post",
            url: loginUrl,
            data: loginPayload,
            headers: {
                "Content-Type": "application/json",
            },
            timeout: 30000,
            httpsAgent, // 👈 this is the key addition
        });
    
        return {
            success: true,
            message: "Beacon Login successful",
            loginResponse: loginResponse.data,
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