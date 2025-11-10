const axios = require("axios"); // Added axios for V4 associations

exports.main = async (context = {}) => {
  console.log("🚀 Saving draft...");

  const { fullOrder, dealId, orderObjectId } = context.parameters || {};

  if (!fullOrder) {
    return {
      statusCode: 400,
      body: { ok: false, error: "fullOrder is required" },
    };
  }

  if (!dealId) {
    return {
      statusCode: 400,
      body: { ok: false, error: "dealId is required for association" },
    };
  }

  const existingOrderId =
    orderObjectId ||
    fullOrder?.selectedOrderId ||
    fullOrder?.orderObjectId ||
    null;

  const orderNumber =
    fullOrder?.orderNumber ||
    fullOrder?.order_id ||
    fullOrder?.selectedOrder?.value?.properties?.order_id ||
    fullOrder?.parsedOrder?.order_id ||
    `ORD-${Date.now()}`;

  // Set the hubspot properties
  const hubspotProperties = {
    order_id: orderNumber,
    payload_snapshot: JSON.stringify(fullOrder),
    status: "Draft",
    total: fullOrder?.orderTotal?.toString(),
    last_saved_at: new Date().toISOString(),
  };

  try {
    if (existingOrderId) {
      const updateConfig = {
        method: "PATCH",
        url: `https://api.hubapi.com/crm/v3/objects/2-22239999/${existingOrderId}`,
        headers: {
          Authorization: `Bearer ${process.env.HUBSPOT_API_KEY}`,
          "Content-Type": "application/json",
        },
        data: {
          properties: hubspotProperties,
        },
      };

      const response = await axios(updateConfig);

      return {
        statusCode: 200,
        body: {
          ok: true,
          message: "Draft updated successfully",
          orderId: existingOrderId,
          hubspotResponse: response.data,
        },
      };
    }

    const createConfig = {
      method: "POST",
      url: "https://api.hubapi.com/crm/v3/objects/2-22239999",
      headers: {
        Authorization: `Bearer ${process.env.HUBSPOT_API_KEY}`,
        "Content-Type": "application/json",
      },
      data: {
        properties: hubspotProperties,
      },
    };

    const response = await axios(createConfig);
    const orderId = response.data.id;

    const associationConfig = {
      method: "POST",
      url: "https://api.hubapi.com/crm/v4/associations/2-22239999/deals/batch/associate/default",
      headers: {
        Authorization: `Bearer ${process.env.HUBSPOT_API_KEY}`,
        "Content-Type": "application/json",
      },
      data: {
        inputs: [
          {
            from: { id: orderId },
            to: { id: dealId },
          },
        ],
      },
    };

    const associationResponse = await axios(associationConfig);

    console.log("Association Response:", associationResponse.data);

    return {
      statusCode: 200,
      body: {
        ok: true,
        message: "Draft saved successfully",
        orderId: orderId,
        hubspotResponse: response.data,
        associationResponse: associationResponse.data,
      },
    };
  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error("❌ HubSpot API Error Details:", error.response?.data);
    return {
      statusCode: 500,
      body: {
        ok: false,
        error: error.message,
        details: error.response?.data,
      },
    };
  }
};
