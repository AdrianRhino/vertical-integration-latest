const axios = require("axios");

exports.main = async () => {
    console.log("ABC Login Sandbox Function");

    abcClientId = process.env.ABCClientSandbox;
    abcClientSecret = process.env.ABCClientSecretSandbox;

    const abcBasic64AuthKey = Buffer.from(`${abcClientId}:${abcClientSecret}`).toString('base64');

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
        
        const token = response.data.access_token;

        const orderConfig = {
            method: "post",
            url: "https://partners-sb.abcsupply.com/api/order/v2/orders",
            headers: {
                Authorization: `Bearer ${token}`,
            },
        };

        const orderResponse = await axios(orderConfig);

        console.log("Order Response:", orderResponse.data);

        return {
            success: true,
            message: "ABC Login Sandbox successful",
            data: response.data,
        };
    } catch (error) {
        console.error("Error in ABC Login Sandbox:", error);
        return {
            success: false,
            message: "ABC Login Sandbox failed",
            error: error.message,
        };
    }
}