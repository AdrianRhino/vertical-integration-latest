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
    if (response.data.access_token) {
            console.log("ABC Access granted");
        } else {
            console.error("No ABC Access Token found");
        }
        const abcAccessToken = response.data.access_token;
        
        // Log the payload being sent (for debugging)
        console.log("Order payload being sent:", JSON.stringify(orderBody, null, 2));
        console.log("Token preview:", abcAccessToken ? `${abcAccessToken.substring(0, 20)}...` : "NO TOKEN");
        
        const orderConfig = {
            method: "post",
            url: "https://partners-sb.abcsupply.com/api/order/v2/orders",
            headers: {
                Authorization: `Bearer ${abcAccessToken}`,
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            data: orderBody,
        };
        
        console.log("Request URL:", orderConfig.url);
        console.log("Request method:", orderConfig.method);
        
        const orderResponse = await axios(orderConfig);
        console.log("Order Response:", orderResponse.data);
        return {
            success: true,
            message: "Order placed successfully",
            data: orderResponse.data,
        };
    } catch (error) {
        const status = error.response?.status;
        const statusText = error.response?.statusText;
        const headers = error.response?.headers;
        const data = error.response?.data;
      
        console.error("Error in ABC Order:", error.message ?? "unknown");
        console.error("Full error object:", error);
        console.error("Has response?", !!error.response);
        console.error("Status:", status, statusText);
        console.error("Headers:", JSON.stringify(headers, null, 2));
        console.error("Response body:", JSON.stringify(data, null, 2));
        console.error("Request config:", {
          url: error.config?.url,
          method: error.config?.method,
          headers: error.config?.headers ? Object.keys(error.config.headers) : "no headers",
          dataPreview: error.config?.data ? JSON.stringify(error.config.data).substring(0, 200) : "no data",
        });
      
        return {
          success: false,
          message: "Order placement failed",
          error: data || error.message,
          status,
        };
      }
}