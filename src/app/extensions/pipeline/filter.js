// SHAPE: Input → Filter → Transform → Store → Output → Loop
// INPUT: InternalOrder
// FILTER: Validate, sanitize, merge data
// TRANSFORM: Clean invalid items, apply sanitization
// STORE: Return cleaned InternalOrder
// OUTPUT: Validated InternalOrder
// LOOP: Can filter multiple orders

import { validator } from "../domain/primitives.js";

/**
 * Filter stage: Validate and sanitize InternalOrder
 * 
 * @param {Object} order - InternalOrder
 * @returns {{ order: InternalOrder, errors: string[], warnings: string[] }}
 */
export function filterStage(order) {
  const errors = [];
  const warnings = [];
  
  // Validate required fields
  if (!order.accountNumber) {
    errors.push("Account number is required");
  }
  
  if (!order.branchId) {
    errors.push("Branch ID is required");
  }
  
  // Validate line items
  if (!order.lineItems || order.lineItems.length === 0) {
    errors.push("At least one line item is required");
  } else {
    order.lineItems.forEach((item, index) => {
      if (!item.sku) {
        errors.push(`Line ${index + 1}: SKU is required`);
      }
      if (!item.qty || item.qty <= 0) {
        errors.push(`Line ${index + 1}: Quantity must be greater than 0`);
      }
      if (!item.uom) {
        warnings.push(`Line ${index + 1}: UOM not specified, defaulting to EA`);
        item.uom = "EA";
      }
    });
  }
  
  // Validate delivery date format
  if (order.delivery?.date) {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(order.delivery.date)) {
      warnings.push("Delivery date format may be invalid (expected YYYY-MM-DD)");
    }
  }
  
  return { order, errors, warnings };
}

