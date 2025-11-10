const axios = require("axios");

exports.main = async () => {
  console.log("Beacon Login...");

  try {
    const loginResponse = await axios.post(
      "https://beaconproplus.com/v1/rest/com/becn/login",
      {
        username: process.env.beaconUsername,
        password: process.env.beaconPass,
        siteId: "homeSite",                     
        persistentLoginType: "RememberMe",      
        userAgent: "desktop",                   
        apiSiteId: "UAT"   
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    const rawCookies = loginResponse.headers["set-cookie"];
    if (!rawCookies) {
      throw new Error("No cookies found in login response");
    }

    // Combine into one cookie header string
    const cookieString = rawCookies
      .map((cookie) => cookie.split(";")[0])
      .join("; ");

    return {
      message: "Beacon Login successful",
      cookies: cookieString,
    };
  } catch (error) {
    console.error("Error in Beacon Login:", error);
    throw new Error("Beacon Login failed", error);
  }
};
