/**
 * Shape Language: Input → Filter → Transform → Store → Output → Loop
 * 
 * Input: Context with token, optional environment
 * Filter: Validates token exists
 * Transform: Gets API base URL from credentials config
 * Store: N/A
 * Output: Product data from SRS API
 * Loop: Self-healing - reads environment from master config if not provided
 */

const axios = require("axios");
const { getCredentials } = require("../config/getCredentials");

exports.main = async (context = {}) => {
  console.log("Fetching SRS Products...");

  const { token, environment = null } = context.parameters || {};

  if (!token) {
    console.error("No access token provided");
    return {
      success: false,
      message: "No access token provided",
    };
  }

  // Get API base URL from credentials config
  const credentials = getCredentials("SRS", environment);
  const apiBaseUrl = credentials.apiBaseUrl;

  console.log(`Using SRS API (${credentials.environment}): ${apiBaseUrl}`);

  const config = {
    method: "get",
    url: `${apiBaseUrl}/products/v2/catalog`,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    timeout: 30000
  };

  try {
    const response = await axios(config);
    
    return {
      success: true,
      message: `SRS Products fetched successfully (${credentials.environment})`,
      products: response.data,
      environment: credentials.environment,
    };
  } catch (error) {
    console.error("Error fetching SRS Products:");
    console.error("Error message:", error.message);
    console.error("Error response:", error.response?.data);
    console.error("Error status:", error.response?.status);
    
    return {
      success: false,
      message: `Error fetching SRS Products: ${error.message}`,
      error: error.response?.data || error.message,
    };
  }
};
