// SHAPE: Input → Filter → Transform → Store → Output → Loop
// INPUT: InternalOrder
// FILTER: Validate order
// TRANSFORM: Convert to supplier payload
// STORE: N/A
// OUTPUT: Supplier response
// LOOP: Can process multiple orders

import { transformToSupplier } from "../pipeline/transformToSupplier.js";
import { getCompleteSupplierConfig } from "../utils/configLoader.js";

/**
 * Base adapter interface
 * All supplier adapters extend this pattern
 */
export class BaseAdapter {
  constructor(supplier, environment = "production") {
    this.supplier = supplier;
    this.environment = environment;
    this.config = getCompleteSupplierConfig(supplier, environment);
  }
  
  /**
   * Transform InternalOrder to supplier payload
   * @param {Object} order - InternalOrder
   * @returns {Object} Supplier payload
   */
  transform(order) {
    return transformToSupplier(order, this.environment);
  }
  
  /**
   * Submit order to supplier API
   * Must be implemented by subclasses
   * @param {Object} payload - Supplier payload
   * @returns {Promise<Object>} Supplier response
   */
  async submit(payload) {
    throw new Error("submit() must be implemented by subclass");
  }
  
  /**
   * Prime order (e.g., fetch pricing)
   * Optional - can be implemented by subclasses
   * @param {Object} order - InternalOrder
   * @returns {Promise<Object>} Updated InternalOrder
   */
  async prime(order) {
    // Default: return order unchanged
    return order;
  }
}

