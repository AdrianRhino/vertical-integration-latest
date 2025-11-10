const axios = require("axios");

exports.main = async (context = {}) => {


  const { abcAccessToken } = context.parameters || {};

  if (!abcAccessToken) {
    console.error("No ABC access token provided");
    return {
      success: false,
      message: "No ABC access token provided",
    };
  }

 // console.log("ABC Access Token:", abcAccessToken ? "Found" : "Not Found");

  const config = {
    method: "get",
    url: "https://partners.abcsupply.com/api/product/v1/items?itemsPerPage=100&pageNumber=3&embed=branches",
    headers: {
      Authorization: `Bearer ${abcAccessToken}`,
      "Content-Type": "application/json",
    },
    timeout: 30000
  };

  try {
    const response = await axios(config);
   
   // console.log("ABC Products Response Data:", response.data);
    return {
      success: true,
      message: "ABC Products fetched successfully",
      data: response.data,
    };
  } catch (error) {
    console.error("Error in ABC Products:");
    console.error("Error message:", error.message);
    console.error("Error response:", error.response?.data);
    console.error("Error status:", error.response?.status);
    console.error("Error config:", error.config);
    
    return {
      success: false,
      message: "ABC Products fetch failed",
      error: error.response?.data || error.message,
      status: error.response?.status,
    };
  }
};
