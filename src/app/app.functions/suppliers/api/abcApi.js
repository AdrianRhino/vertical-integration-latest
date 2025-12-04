/**
 * Shape Language: Input → Filter → Transform → Store → Output → Loop
 * 
 * Input: Context with abcAccessToken, optional environment
 * Filter: Validates access token exists
 * Transform: Gets API base URL from credentials config
 * Store: N/A
 * Output: Product items from ABC API
 * Loop: Self-healing - reads environment from order config if not provided
 */

const axios = require("axios");
const { getCredentials } = require("../config/getCredentials");

exports.main = async (context = {}) => {
  const {
    abcAccessToken,
    pageNumber = 1,
    itemsPerPage = 60,     // you can raise to 1000 later
    embedBranches = false,  // keep false for list calls
    familyItems = false,    // keep false for list calls
    environment = null,     // optional environment override
  } = context.parameters || {};

  if (!abcAccessToken) {
    return {
      statusCode: 400,
      body: { ok: false, error: "Missing abcAccessToken" },
    };
  }

  // Get API base URL from credentials config
  const credentials = getCredentials("ABC", environment);
  const apiBaseUrl = credentials.apiBaseUrl;

  const params = { pageNumber, itemsPerPage };
  if (embedBranches) params.embed = "branches";
  if (familyItems) params.familyItems = true;

  try {
    const { data } = await axios.get(
      `${apiBaseUrl}/api/product/v1/items`,
      {
        headers: { Authorization: `Bearer ${abcAccessToken}` },
        params,
        timeout: 36000,
      }
    );

    return {
      statusCode: 200,
      body: {
        ok: true,
        message: `ABC items page fetched (${credentials.environment})`,
        data, // expect { items: [...], pagination: { pageNumber, totalPages, ... } }
        environment: credentials.environment,
      },
    };
  } catch (e) {
    return {
      statusCode: e.response?.status || 500,
      body: {
        ok: false,
        error: e.response?.data || e.message,
      },
    };
  }
};
