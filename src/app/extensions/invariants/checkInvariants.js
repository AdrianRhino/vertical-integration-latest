// SHAPE: Input → Filter → Transform → Store → Output → Loop
// INPUT: InternalOrder, supplier name
// FILTER: Validate invariants
// TRANSFORM: Check rules, apply self-healing
// STORE: Return validation results
// OUTPUT: Validation result with errors/warnings
// LOOP: Can check multiple orders

import { validator } from "../domain/primitives.js";
import { ERROR_CODES } from "./errorCodes.js";
import { getCompleteSupplierConfig } from "../utils/configLoader.js";

/**
 * Check invariants for an order
 * 
 * @param {Object} order - InternalOrder
 * @param {string} supplier - Supplier name
 * @returns {{ valid: boolean, errors: Array, warnings: Array }}
 */
export function checkInvariants(order, supplier) {
  const errors = [];
  const warnings = [];
  const config = getCompleteSupplierConfig(supplier);
  const requiredFields = config.requiredFields || {};
  
  // Check required fields
  if (requiredFields.accountNumber && !order.accountNumber) {
    errors.push({
      code: ERROR_CODES.MISSING_FIELD,
      field: "accountNumber",
      message: config.messages?.accountNumber || "Account number is required",
    });
  }
  
  if (requiredFields.branchId && !order.branchId) {
    errors.push({
      code: ERROR_CODES.MISSING_FIELD,
      field: "branchId",
      message: config.messages?.branchId || "Branch ID is required",
    });
  }
  
  // Validate line items
  if (!order.lineItems || order.lineItems.length === 0) {
    errors.push({
      code: ERROR_CODES.MISSING_FIELD,
      field: "lineItems",
      message: "At least one line item is required",
    });
  } else {
    order.lineItems.forEach((item, index) => {
      // Validate SKU
      const skuValidation = validator(item.sku, { required: true, type: "string" });
      if (!skuValidation.valid) {
        errors.push({
          code: ERROR_CODES.MISSING_FIELD,
          field: `lineItems[${index}].sku`,
          message: `Line ${index + 1}: ${skuValidation.error}`,
        });
      }
      
      // Validate quantity
      const qtyValidation = validator(item.qty, {
        required: true,
        type: "number",
        min: 0.01,
      });
      if (!qtyValidation.valid) {
        errors.push({
          code: ERROR_CODES.SCHEMA_MISMATCH,
          field: `lineItems[${index}].qty`,
          message: `Line ${index + 1}: ${qtyValidation.error}`,
        });
      }
      
      // Validate UOM
      if (!item.uom) {
        warnings.push({
          field: `lineItems[${index}].uom`,
          message: `Line ${index + 1}: UOM not specified, defaulting to EA`,
        });
        // Self-healing: apply default
        item.uom = "EA";
      }
    });
  }
  
  // Validate delivery date format
  if (order.delivery?.date) {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(order.delivery.date)) {
      errors.push({
        code: ERROR_CODES.SCHEMA_MISMATCH,
        field: "delivery.date",
        message: "Delivery date must be in YYYY-MM-DD format",
      });
    }
  }
  
  // Validate enum values
  const enumMappings = config.enumMappings || {};
  if (order.delivery?.method && enumMappings["delivery.method"]) {
    const validMethods = Object.keys(enumMappings["delivery.method"]);
    if (!validMethods.includes(order.delivery.method)) {
      warnings.push({
        code: ERROR_CODES.ENUM_UNMAPPED,
        field: "delivery.method",
        message: `Unknown delivery method: ${order.delivery.method}, may cause issues`,
      });
    }
  }
  
  if (order.delivery?.timeCode && enumMappings["delivery.timeCode"]) {
    const validTimeCodes = Object.keys(enumMappings["delivery.timeCode"]);
    if (!validTimeCodes.includes(order.delivery.timeCode)) {
      warnings.push({
        code: ERROR_CODES.ENUM_UNMAPPED,
        field: "delivery.timeCode",
        message: `Unknown time code: ${order.delivery.timeCode}, may cause issues`,
      });
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

