const axios = require("axios");

exports.main = async (context = {}) => {
  console.log("Fetching SRS Products...");
 // console.log("Context received:", context);
 // console.log("Parameters received:", context.parameters);

  const { token } = context.parameters || {};

  if (!token) {
    console.error("No access token provided");
    return {
      success: false,
      message: "No access token provided",
    };
  }

  console.log("Token received:", token ? "Token exists" : "No token");

  const config = {
    method: "get",
    url: "https://services.roofhub.pro/products/v2/catalog",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    timeout: 30000
  };

 // console.log("Making request to:", config.url);
 // console.log("Request headers:", config.headers);

  try {
    const response = await axios(config);
  //  console.log("SRS Products Response Status:", response.status);
  //  console.log("SRS Products Response Data:", response.data);
    
    return {
      success: true,
      message: "SRS Products fetched successfully",
      products: response.data,
    };
  } catch (error) {
    console.error("Error fetching SRS Products:");
    console.error("Error message:", error.message);
    console.error("Error response:", error.response?.data);
    console.error("Error status:", error.response?.status);
    
    return {
      success: false,
      message: `Error fetching SRS Products: ${error.message}`,
      error: error.response?.data || error.message,
    };
  }
};
