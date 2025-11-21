// SHAPE: Input → Filter → Transform → Store → Output → Loop
// INPUT: InternalOrder
// FILTER: Validate order
// TRANSFORM: Convert to ABC payload
// STORE: N/A
// OUTPUT: ABC API response
// LOOP: Can process multiple orders

import { BaseAdapter } from "./baseAdapter.js";
import { getSupplierEnvironment } from "../utils/configLoader.js";

/**
 * ABC Supply adapter
 */
export class ABCAdapter extends BaseAdapter {
  constructor(environment = "production") {
    super("ABC", environment);
  }
  
  /**
   * Submit order to ABC API
   * @param {Object} payload - ABC payload (array format)
   * @returns {Promise<Object>} Response with success/error
   */
  async submit(payload) {
    // This will be called from serverless function
    // For now, return structure indicating it needs serverless call
    const envConfig = getSupplierEnvironment(this.environment, "ABC");
    const apiUrl = envConfig.orderApiUrl || "https://partners.abcsupply.com/api/order/v2/orders";
    
    return {
      success: false,
      message: "ABC adapter requires serverless function call",
      apiUrl,
      payload,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
    };
  }
}

