// beacon.Api.js (serverless)
const axios = require("axios");

exports.main = async (context = {}) => {
  const {
    beaconCookies,
    accountId,
    pageNumber = 1,
    pageSize = 30, // Beacon max
    filter, // optional filter string for "itemlist" endpoint
  } = context.parameters || {};

  if (!beaconCookies || !accountId) {
    return {
      statusCode: 400,
      body: { ok: false, error: "Missing beaconCookies or accountId" },
    };
  }

  const params = { accountId, pageNumber, pageSize, filter };
  try {
    const { data } = await axios.get(
      "https://beaconproplus.com/v1/rest/com/becn/itemlist",
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
        message: "Beacon items page fetched",
        data, // expect { items: [...], pagination: { pageNumber, totalPages, ... } }
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
