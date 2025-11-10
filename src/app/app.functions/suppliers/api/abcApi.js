// fetchAbcPage.js (serverless)
const axios = require("axios");

exports.main = async (context = {}) => {
  const {
    abcAccessToken,
    pageNumber = 1,
    itemsPerPage = 60,     // you can raise to 1000 later
    embedBranches = false,  // keep false for list calls
    familyItems = false,    // keep false for list calls
  } = context.parameters || {};

  if (!abcAccessToken) {
    return {
      statusCode: 400,
      body: { ok: false, error: "Missing abcAccessToken" },
    };
  }

  const params = { pageNumber, itemsPerPage };
  if (embedBranches) params.embed = "branches";
  if (familyItems) params.familyItems = true;

  try {
    const { data } = await axios.get(
      "https://partners.abcsupply.com/api/product/v1/items",
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
        message: "ABC items page fetched",
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
