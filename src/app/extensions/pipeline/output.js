// SHAPE: Input → Filter → Transform → Store → Output → Loop
// INPUT: InternalOrder
// FILTER: N/A
// TRANSFORM: Convert to supplier payload
// STORE: Return supplier payload
// OUTPUT: Supplier-specific payload
// LOOP: Can output multiple orders

import { transformToSupplier } from "./transformToSupplier.js";

/**
 * Output stage: Convert InternalOrder → supplier-specific payload
 * 
 * @param {Object} order - InternalOrder
 * @param {string} environment - Environment ("production", "sandbox", "dev")
 * @returns {Object} Supplier-specific payload
 */
export function outputStage(order, environment = "production") {
  return transformToSupplier(order, environment);
}

