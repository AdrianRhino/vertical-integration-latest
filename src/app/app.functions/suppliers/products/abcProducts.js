/**
 * Shape Language: Input → Filter → Transform → Store → Output → Loop
 * 
 * Input: Context with abcAccessToken, optional environment
 * Filter: Validates access token exists
 * Transform: Gets API base URL from credentials config
 * Store: N/A
 * Output: Product data from ABC API
 * Loop: Self-healing - reads environment from master config if not provided
 */

const axios = require("axios");
const { getCredentials } = require("../config/getCredentials");

exports.main = async (context = {}) => {
  const { abcAccessToken, environment = null } = context.parameters || {};

  if (!abcAccessToken) {
    console.error("No ABC access token provided");
    return {
      success: false,
      message: "No ABC access token provided",
    };
  }

  // Get API base URL from credentials config
  const credentials = getCredentials("ABC", environment);
  const apiBaseUrl = credentials.apiBaseUrl;

  const config = {
    method: "get",
    url: `${apiBaseUrl}/api/product/v1/items?itemsPerPage=100&pageNumber=3&embed=branches`,
    headers: {
      Authorization: `Bearer ${abcAccessToken}`,
      "Content-Type": "application/json",
    },
    timeout: 30000
  };

  try {
    const response = await axios(config);
   
    return {
      success: true,
      message: `ABC Products fetched successfully (${credentials.environment})`,
      data: response.data,
      environment: credentials.environment,
    };
  } catch (error) {
    console.error("Error in ABC Products:");
    console.error("Error message:", error.message);
    console.error("Error response:", error.response?.data);
    console.error("Error status:", error.response?.status);
    console.error("Error config:", error.config);
    
    return {
      success: false,
      message: "ABC Products fetch failed",
      error: error.response?.data || error.message,
      status: error.response?.status,
    };
  }
};
