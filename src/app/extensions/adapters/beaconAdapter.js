// SHAPE: Input → Filter → Transform → Store → Output → Loop
// INPUT: InternalOrder
// FILTER: Validate order
// TRANSFORM: Convert to Beacon payload
// STORE: N/A
// OUTPUT: Beacon API response
// LOOP: Can process multiple orders

import { BaseAdapter } from "./baseAdapter.js";
import { getSupplierEnvironment } from "../utils/configLoader.js";

/**
 * Beacon Building Products adapter
 */
export class BeaconAdapter extends BaseAdapter {
  constructor(environment = "production") {
    super("Beacon", environment);
  }
  
  /**
   * Submit order to Beacon API
   * @param {Object} payload - Beacon payload
   * @returns {Promise<Object>} Response with success/error
   */
  async submit(payload) {
    // This will be called from serverless function
    // For now, return structure indicating it needs serverless call
    const envConfig = getSupplierEnvironment(this.environment, "Beacon");
    const baseUrl = envConfig.baseUrl || "https://beaconproplus.com/v1/rest/com/becn";
    const apiUrl = `${baseUrl}/submitOrder`;
    
    return {
      success: false,
      message: "Beacon adapter requires serverless function call",
      apiUrl,
      payload,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    };
  }
}

