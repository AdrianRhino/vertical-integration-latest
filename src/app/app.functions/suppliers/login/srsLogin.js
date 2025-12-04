/**
 * Shape Language: Input → Filter → Transform → Store → Output → Loop
 * 
 * Input: Context (optional environment parameter)
 * Filter: Validates credentials exist
 * Transform: Gets credentials from config, creates auth token
 * Store: N/A
 * Output: Access token for SRS API
 * Loop: Self-healing - reads environment from order config if not provided
 */

const axios = require("axios");
const qs = require("qs");
const { getCredentials } = require("../config/getCredentials");

exports.main = async (context = {}) => {
  console.log("Login into SRS...");

  try {
    // Get environment from context or read from config
    const environment = context.parameters?.environment || null;
    const credentials = getCredentials("SRS", environment);

    console.log("SRS Client ID:", credentials.clientId ? "Found" : "Not Found");
    console.log("SRS Client Secret:", credentials.clientSecret ? "Found" : "Not Found");
    console.log("SRS Environment:", credentials.environment);

    if (!credentials.clientId || !credentials.clientSecret) {
      console.error(
        `❌ Missing SRS credentials for ${credentials.environment}. ` +
        `Check environment variables for ${credentials.environment} environment`
      );
      return {
        success: false,
        message: "SRS credentials not configured",
        error: `Missing SRS credentials for environment: ${credentials.environment}`,
      };
    }

    const data = qs.stringify({
      grant_type: "client_credentials",
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      scope: "ALL",
    });

    const config = {
      method: "post",
      url: credentials.authUrl,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      data: data,
    };

    const response = await axios(config);
    console.log("SRS Response:", response.data?.access_token);
    return {
      success: true,
      message: `SRS Authentication successful (${credentials.environment})`,
      accessToken: response.data?.access_token,
      environment: credentials.environment,
    };
  } catch (error) {
    console.error("Error during SRS Authentication:", error);
    console.error("Error details:", error.response?.data || error.message);
    return {
      success: false,
      message: "SRS Authentication failed",
      error: error.response?.data || error.message,
      statusCode: error.response?.status || 500,
    };
  }
};
