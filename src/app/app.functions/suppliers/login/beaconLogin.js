/**
 * Shape Language: Input → Filter → Transform → Store → Output → Loop
 * 
 * Input: Context (optional environment parameter)
 * Filter: Validates credentials exist
 * Transform: Gets credentials from config, creates auth session
 * Store: N/A
 * Output: Session cookies for Beacon API
 * Loop: Self-healing - reads environment from order config if not provided
 */

const axios = require("axios");
const { getCredentials } = require("../config/getCredentials");

exports.main = async (context = {}) => {
  console.log("Beacon Login...");

  try {
    // Get environment from context or read from config
    const environment = context.parameters?.environment || null;
    const credentials = getCredentials("BEACON", environment);

    if (!credentials.username || !credentials.password) {
      throw new Error(
        `Missing Beacon credentials for ${credentials.environment}. ` +
        `Check environment variables: username, password`
      );
    }

    const loginPayload = {
      username: credentials.username,
      password: credentials.password,
      siteId: "homeSite",
      persistentLoginType: "RememberMe",
      userAgent: "desktop",
    };

    // Only include apiSiteId if it's configured and not empty
    if (credentials.apiSiteId && credentials.apiSiteId.trim() !== "") {
      loginPayload.apiSiteId = credentials.apiSiteId;
    }

    const loginResponse = await axios.post(
      credentials.authUrl,
      loginPayload,
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
      message: `Beacon Login successful (${credentials.environment})`,
      cookies: cookieString,
      environment: credentials.environment,
    };
  } catch (error) {
    console.error("Error in Beacon Login:", error);
    return {
      success: false,
      message: "Beacon Login failed",
      error: error.message,
    };
  }
};
