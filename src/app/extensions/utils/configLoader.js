// SHAPE: Input → Filter → Transform → Store → Output → Loop
// INPUT: Supplier name, environment name
// FILTER: Validate config exists
// TRANSFORM: Load and merge configs
// STORE: Return config object
// OUTPUT: Supplier config ready for use
// LOOP: Configs can be reloaded as needed

import abcConfig from "../config/abc.json";
import beaconConfig from "../config/beacon.json";
import srsConfig from "../config/srs.json";
import supplierEnvironments from "../config/supplierEnvironments.json";

/**
 * Load supplier configuration
 * Safe defaults if config is missing
 * 
 * @param {string} supplier - Supplier name ("ABC", "Beacon", "SRS")
 * @returns {Object} Supplier config or empty object if not found
 */
export function loadSupplierConfig(supplier) {
  const supplierUpper = String(supplier || "").toUpperCase();
  
  switch (supplierUpper) {
    case "ABC":
      return { ...abcConfig };
    case "BEACON":
      return { ...beaconConfig };
    case "SRS":
      return { ...srsConfig };
    default:
      console.warn(`Unknown supplier: ${supplier}, returning empty config`);
      return {};
  }
}

/**
 * Get supplier environment configuration
 * 
 * @param {string} environment - Environment name ("production", "sandbox", "dev")
 * @param {string} supplier - Supplier name
 * @returns {Object} Environment-specific config or empty object
 */
export function getSupplierEnvironment(environment, supplier) {
  const envConfig = supplierEnvironments.environments?.[environment];
  if (!envConfig) {
    console.warn(`Unknown environment: ${environment}`);
    return {};
  }
  
  const supplierUpper = String(supplier || "").toUpperCase();
  return envConfig[supplierUpper] || {};
}

/**
 * Get complete supplier configuration (config + environment)
 * 
 * @param {string} supplier - Supplier name
 * @param {string} environment - Environment name (default: "production")
 * @returns {Object} Merged config with environment overrides
 */
export function getCompleteSupplierConfig(supplier, environment = "production") {
  const baseConfig = loadSupplierConfig(supplier);
  const envConfig = getSupplierEnvironment(environment, supplier);
  
  // Merge environment config into base config
  return {
    ...baseConfig,
    ...envConfig,
    // Deep merge defaults
    defaults: {
      ...(baseConfig.defaults || {}),
      ...(envConfig.defaults || {}),
    },
  };
}

