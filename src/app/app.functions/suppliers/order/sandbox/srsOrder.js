const axios = require("axios");
const qs = require("qs");

exports.main = async (context = {}) => {

    console.log("Placing SRS sandbox order...");

    const srsClientId = process.env.SRSID_STAGING;
    const srsClientSecret = process.env.SRSSECRET_STAGING;

    const data = qs.stringify({
        grant_type: "client_credentials",
        client_id: srsClientId,
        client_secret: srsClientSecret,
        scope: "ALL"
    });

    const config = {
        method: "post",
        url: "https://services-qa.roofhub.pro/authentication/token",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
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
        return {
            success: false,
            message: "SRS Authentication failed",
            error: error.message
        }
    }
}