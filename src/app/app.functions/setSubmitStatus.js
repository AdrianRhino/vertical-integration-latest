const axios = require("axios"); // Added axios for V4 associations

exports.main = async (context = {}) => {
    const { status, orderId } = context.parameters || {};

    if (!status) {
        return {
            statusCode: 400,
            body: { error: "status is required" },
        };
    }

    if (!orderId) {
        return {
            statusCode: 400,
            body: { error: "orderId is required" },
        };
    }

    const token = process.env.HUBSPOT_API_KEY;

    console.log("Order ID: ", orderId);
    console.log("Status: ", status);
    
    try {
        const response = await axios.patch(
            `https://api.hubapi.com/crm/v3/objects/2-22239999/${orderId}`,
            { 
                properties: {
                    status: status,
                },
            },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
            }
        );
        console.log("Order status updated successfully:", response.data);
        return {
            statusCode: 200,
            body: { message: "Order status updated successfully", data: response.data },
        };
    } catch (error) {
        console.error("Error updating order status:", error.message);
        console.error("Error details:", error.response?.data);
        return {
            statusCode: 500,
            body: { 
                error: "Failed to update order status",
                details: error.response?.data || error.message
            },
        };
    }
}