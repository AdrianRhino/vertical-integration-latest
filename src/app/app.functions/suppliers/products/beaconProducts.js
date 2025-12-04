/**
 * Shape Language: Input → Filter → Transform → Store → Output → Loop
 * 
 * Input: Context with cookies, optional environment
 * Filter: Validates cookies exist
 * Transform: Gets API base URL from credentials config
 * Store: N/A
 * Output: Product data from Beacon API
 * Loop: Self-healing - reads environment from master config if not provided
 */

const axios = require("axios");
const { getCredentials } = require("../config/getCredentials");

exports.main = async (context) => {
  console.log("Beacon Products...");

  const { cookies, environment = null } = context.parameters || {};

  if (!cookies) {
    return {
      success: false,
      message: "No cookies provided",
      error: "Missing cookies for Beacon authentication",
    };
  }

  // Get API base URL from credentials config
  const credentials = getCredentials("BEACON", environment);
  const apiBaseUrl = credentials.apiBaseUrl;

  try {
    const beaconProducts = await axios.get(
      `${apiBaseUrl}/v1/rest/com/becn/itemlist`,
      {
        headers: {
          Cookie: cookies,
        },
        params: {
          accountId: "557799"
        }
      }
    );

    return {
      success: true,
      message: `Beacon Products fetched successfully (${credentials.environment})`,
      products: beaconProducts.data,
      environment: credentials.environment,
    };
  } catch (error) {
    console.error("Error in Beacon Products:", error);
    return {
      success: false,
      message: "Beacon Products fetch failed",
      error: error.message,
    };
  }
};
