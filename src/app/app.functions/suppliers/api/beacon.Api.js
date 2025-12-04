/**
 * Shape Language: Input → Filter → Transform → Store → Output → Loop
 * 
 * Input: Context with beaconCookies, accountId, optional environment
 * Filter: Validates cookies and accountId exist
 * Transform: Gets API base URL from credentials config
 * Store: N/A
 * Output: Product items from Beacon API
 * Loop: Self-healing - reads environment from master config if not provided
 */

const axios = require("axios");
const { getCredentials } = require("../config/getCredentials");

exports.main = async (context = {}) => {
  const {
    beaconCookies,
    accountId,
    pageNumber = 1,
    pageSize = 30, // Beacon max
    filter, // optional filter string for "itemlist" endpoint
    environment = null,
  } = context.parameters || {};

  if (!beaconCookies || !accountId) {
    return {
      statusCode: 400,
      body: { ok: false, error: "Missing beaconCookies or accountId" },
    };
  }

  // Get API base URL from credentials config
  const credentials = getCredentials("BEACON", environment);
  const apiBaseUrl = credentials.apiBaseUrl;

  const params = { accountId, pageNumber, pageSize, filter };
  try {
    const { data } = await axios.get(
      `${apiBaseUrl}/v1/rest/com/becn/itemlist`,
      {
        headers: { Cookie: beaconCookies },
        params,
        timeout: 30000,
      }
    );
    return {
      statusCode: 200,
      body: {
        ok: true,
        message: `Beacon items page fetched (${credentials.environment})`,
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
