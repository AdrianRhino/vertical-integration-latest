const axios = require("axios");

exports.main = async (context = {}) => {

    const abcClientId = process.env.ABCClientSandbox;
    const abcClientSecret = process.env.ABCClientSecretSandbox;

    const abcBasic64AuthKey = Buffer.from(`${abcClientId}:${abcClientSecret}`).toString('base64');

    const { orderBody }= context.parameters || {};

    const config = {
        method: "post",
        url: "https://sandbox.auth.partners.abcsupply.com/oauth2/aus1vp07knpuqf6Xz0h8/v1/token?grant_type=client_credentials&scope=location.read product.read pricing.read account.read order.write order.read",
        headers: {
            Authorization: `Basic ${abcBasic64AuthKey}`,
            "Content-Type": "application/x-www-form-urlencoded",
        },
    };

    try {
        const response = await axios(config);
        const abcAccessToken = response.data.access_token;
        const orderConfig = {
            method: "post",
            url: "https://partners-sb.abcsupply.com/api/order/v2/orders",
            headers: {
                Authorization: `Bearer ${abcAccessToken}`,
                "Content-Type": "application/json",
            },
            data: orderBody,
        };
        const orderResponse = await axios(orderConfig);
        console.log("Order Response:", orderResponse.data);
        return {
            success: true,
            message: "Order placed successfully",
            data: orderResponse.data,
        };
    } catch (error) {
        console.error("Error in ABC Order:", error.message);
        console.error("Error response:", error.response?.data);
        console.error("Error status:", error.response?.status);
        console.error("Error config:", error.config);
        return {
            success: false,
            message: "Order placement failed",
            error: error.response?.data || error.message,
            status: error.response?.status,
        };
    }
}