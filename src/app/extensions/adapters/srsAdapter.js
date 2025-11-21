// SHAPE: Input → Filter → Transform → Store → Output → Loop
// INPUT: InternalOrder
// FILTER: Validate order
// TRANSFORM: Convert to SRS payload
// STORE: N/A
// OUTPUT: SRS API response
// LOOP: Can process multiple orders

import { BaseAdapter } from "./baseAdapter.js";
import { getSupplierEnvironment } from "../utils/configLoader.js";

/**
 * SRS Distribution adapter
 */
export class SRSAdapter extends BaseAdapter {
  constructor(environment = "production") {
    super("SRS", environment);
  }
  
  /**
   * Submit order to SRS API
   * @param {Object} payload - SRS payload
   * @returns {Promise<Object>} Response with success/error
   */
  async submit(payload) {
    // This will be called from serverless function
    // For now, return structure indicating it needs serverless call
    const envConfig = getSupplierEnvironment(this.environment, "SRS");
    const apiUrl = "/submitOrder"; // SRS uses relative URL
    
    return {
      success: false,
      message: "SRS adapter requires serverless function call",
      apiUrl,
      payload,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    };
  }
}

