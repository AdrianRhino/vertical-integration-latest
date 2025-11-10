const axios = require("axios");
const qs = require("qs");

exports.main = async () => {
 console.log("Login into SRS...");
 
 const srsClientId = process.env.SRSIDPROD;
 const srsClientSecret = process.env.SRSSECRETPROD;

 console.log("SRS Client ID:", srsClientId ? "Found" : "Not Found");
 console.log("SRS Client Secret:", srsClientSecret ? "Found" : "Not Found");
 
 if (!srsClientId || !srsClientSecret) {
   console.error("❌ Missing SRS credentials. Check environment variables: SRSIDPROD, SRSSECRETPROD");
   return {
     success: false,
     message: "SRS credentials not configured",
     error: "Missing SRSIDPROD or SRSSECRETPROD environment variable"
   };
 }

 const data = qs.stringify({
  grant_type: "client_credentials",
  client_id: srsClientId,
  client_secret: srsClientSecret,
  scope: 'ALL'
 });

 const config = {
  method: 'post',
  url: 'https://services.roofhub.pro/authentication/token',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded'
  },
  data: data
 }

 try {
  const response = await axios(config);
  console.log("SRS Response:", response.data?.access_token);
  return {
    success: true,
    message: "SRS Authentication successful",
    accessToken: response.data?.access_token
  }
 } catch (error) {
  console.error("Error during SRS Authentication:", error);
  console.error("Error details:", error.response?.data || error.message);
  return {
    success: false,
    message: "SRS Authentication failed",
    error: error.response?.data || error.message,
    statusCode: error.response?.status || 500
  };
 }
 
};
