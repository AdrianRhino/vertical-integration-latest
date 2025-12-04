/**
 * Shape Language: Input → Filter → Transform → Store → Output → Loop
 * 
 * Input: Context (optional environment parameter)
 * Filter: Validates credentials exist
 * Transform: Gets credentials from config, creates auth token
 * Store: N/A
 * Output: Access token for ABC API
 * Loop: Self-healing - reads environment from order config if not provided
 */

const axios = require("axios");
const { getCredentials } = require("../config/getCredentials");

exports.main = async (context = {}) => {
  console.log("ABC Login Function");

  try {
    // Get environment from context or read from config
    const environment = context.parameters?.environment || null;
    const credentials = getCredentials("ABC", environment);

    // Check if we have the required credentials
    if (!credentials.clientId || !credentials.clientSecret) {
      return {
        success: false,
        message: "ABC credentials missing",
        error: `ABC credentials not found for environment: ${credentials.environment}. Check environment variables: ${credentials.clientId ? '' : 'clientId'}, ${credentials.clientSecret ? '' : 'clientSecret'}`
      };
    }

    // Using Buffer for Node.js environment (replaces btoa)
    const abcBasic64AuthKey = Buffer.from(
      `${credentials.clientId}:${credentials.clientSecret}`
    ).toString("base64");

    const config = {
      method: "post",
      url: credentials.authUrl,
      headers: {
        Authorization: `Basic ${abcBasic64AuthKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    };

    const response = await axios(config);
    return {
      success: true,
      message: `ABC Login successful (${credentials.environment})`,
      data: response.data,
      environment: credentials.environment,
    };
  } catch (error) {
    console.error("Error in ABC Login:", error);
    return {
      success: false,
      message: "ABC Login failed",
      error: error.message,
    };
  }
};
