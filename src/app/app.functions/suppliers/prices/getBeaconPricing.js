const axios = require("axios");

exports.main = async (context = {}) => {

    // Test SKU: 660455

    console.log("Beacon Pricing...");

    const { cookies, fullOrder } = context.parameters || {};

    if (!cookies) {
        console.error("No cookies provided");
        return {
            success: false,
            message: "No cookies provided",
        };
    }

    if (!fullOrder) {
        console.error("No full order provided");
        return {
            success: false,
            message: "No full order provided",
        };
    }

    const formattedLineItems = fullOrder.fullOrderItems.map(item => ({
        id: item.id,
        itemNumber: item.sku,
        quantity: item.qty,
        uom: item.uom,
    }));

    config = {
        method: "get",
        url: "https://beaconproplus.com/v1/rest/com/becn/pricing",
        headers: {
            Cookie: cookies,
        },
        params: {
            skuIds: formattedLineItems.map(item => item.itemNumber).join(","),
        },
    };

    try {
        const response = await axios(config);
        console.log("Beacon Pricing Response: ", response.data);
        return {
            success: true,
            message: "Beacon Pricing fetched successfully",
            data: response.data,
        };
    } catch (error) {
        console.error("Error in Beacon Pricing: ", error);
        return {
            success: false,
            message: "Error in Beacon Pricing",
            error: error.response?.data || error.message,
            status: error.response?.status,
        };
    }
}