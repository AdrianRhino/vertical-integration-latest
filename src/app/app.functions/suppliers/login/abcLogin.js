const axios = require("axios");

exports.main = async () => {
  console.log("ABC Login Function");

  const abcClientId = process.env.ABCClient;
  const abcClientSecret = process.env.ABCClientSecret;
  
  // Check if we have the required credentials
  if (!abcClientId || !abcClientSecret) {
    return {
      success: false,
      message: "ABC credentials missing",
      error: "ABCClient and ABCClientSecret environment variables are required"
    };
  }
  
  // Using Buffer for Node.js environment (replaces btoa)
  const abcBasic64AuthKey = Buffer.from(`${abcClientId}:${abcClientSecret}`).toString('base64');

  const config = {
    method: "post",
    url: "https://auth.partners.abcsupply.com/oauth2/ausvvp0xuwGKLenYy357/v1/token?grant_type=client_credentials&scope=location.read product.read pricing.read account.read order.write order.read",
    headers: {
      Authorization: `Basic ${abcBasic64AuthKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  };

  try {
    const response = await axios(config);
    return {
      success: true,
      message: "ABC Login successful",
      data: response.data,
    };
  } catch (error) {
    console.error("Error in ABC Login:", error);
    return {
      success: false,
      message: "ABC Login failed",
      error: error.message,
    };
  }
};
