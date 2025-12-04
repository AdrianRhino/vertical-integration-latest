/**
 * Shape Language: Input → Filter → Transform → Store → Output → Loop
 * 
 * Input: Supplier name, environment (optional - reads from master config if not provided)
 * Filter: Validates supplier exists in credentials registry
 * Transform: Reads master environment config, maps to credential env vars
 * Store: N/A (reads from process.env at runtime)
 * Output: Credential object with clientId, clientSecret, authUrl, apiBaseUrl
 * Loop: Self-healing defaults to "prod" if environment not specified
 */

const fs = require("fs");
const path = require("path");

/**
 * Gets the master environment setting from environment.json
 * This is the SINGLE SOURCE OF TRUTH for environment across all suppliers
 * @returns {string} Environment value (prod or sandbox)
 */
function getMasterEnvironment() {
  const envConfigPath = path.join(__dirname, "environment.json");
  try {
    const envConfigData = fs.readFileSync(envConfigPath, "utf8");
    const envConfig = JSON.parse(envConfigData);
    return envConfig.environment || "prod"; // Default to prod if not specified
  } catch (error) {
    console.warn(`Could not read environment.json, defaulting to prod: ${error.message}`);
    return "prod";
  }
}

/**
 * Gets credentials for a supplier based on environment
 * @param {string} supplierName - Supplier name (ABC, SRS, BEACON)
 * @param {string} environment - Optional environment (prod, sandbox). If not provided, reads from master config
 * @returns {object} Credential object with clientId, clientSecret, authUrl, apiBaseUrl
 */
function getCredentials(supplierName, environment = null) {
  // Load credentials registry
  const credentialsPath = path.join(__dirname, "credentials.json");
  let credentialsRegistry;
  
  try {
    const credentialsData = fs.readFileSync(credentialsPath, "utf8");
    credentialsRegistry = JSON.parse(credentialsData);
  } catch (error) {
    console.error(`Error reading credentials.json: ${error.message}`);
    throw new Error("Credentials registry not found");
  }

  // Validate supplier exists
  if (!credentialsRegistry[supplierName]) {
    throw new Error(`Supplier ${supplierName} not found in credentials registry`);
  }

  // If environment not provided, read from master environment config (SINGLE SOURCE OF TRUTH)
  if (!environment) {
    environment = getMasterEnvironment();
    console.log(`Using master environment setting: ${environment}`);
  }

  // Normalize environment (default to prod)
  environment = environment || "prod";

  // Get credential config for supplier + environment
  const credentialConfig = credentialsRegistry[supplierName][environment];
  
  if (!credentialConfig) {
    throw new Error(
      `Environment "${environment}" not found for supplier ${supplierName}`
    );
  }

  // Build credential object based on supplier type
  const credentials = {
    environment,
    authUrl: credentialConfig.authUrl,
    apiBaseUrl: credentialConfig.apiBaseUrl,
  };

  // ABC and SRS use clientId/clientSecret
  if (credentialConfig.clientIdEnv && credentialConfig.clientSecretEnv) {
    credentials.clientId = process.env[credentialConfig.clientIdEnv];
    credentials.clientSecret = process.env[credentialConfig.clientSecretEnv];
    
    if (!credentials.clientId || !credentials.clientSecret) {
      console.warn(
        `Missing credentials for ${supplierName} ${environment}: ` +
        `${credentialConfig.clientIdEnv}, ${credentialConfig.clientSecretEnv}`
      );
    }
  }

  // BEACON uses username/password and apiSiteId
  if (credentialConfig.usernameEnv && credentialConfig.passwordEnv) {
    credentials.username = process.env[credentialConfig.usernameEnv];
    credentials.password = process.env[credentialConfig.passwordEnv];
    
    if (!credentials.username || !credentials.password) {
      console.warn(
        `Missing credentials for ${supplierName} ${environment}: ` +
        `${credentialConfig.usernameEnv}, ${credentialConfig.passwordEnv}`
      );
    }
    
    // Add apiSiteId for BEACON if configured
    if (credentialConfig.apiSiteId) {
      credentials.apiSiteId = credentialConfig.apiSiteId;
    }
  }

  return credentials;
}

module.exports = { getCredentials };

