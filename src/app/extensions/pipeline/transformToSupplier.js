// SHAPE: Input → Filter → Transform → Store → Output → Loop
// INPUT: InternalOrder (canonical), SupplierConfig
// FILTER: Validate order has required fields
// TRANSFORM: Convert InternalOrder → supplier-specific payload
// STORE: Return supplier payload
// OUTPUT: Supplier payload ready for API call
// LOOP: Can transform multiple orders

import { accessor, formatter, setNestedValue } from "../domain/primitives.js";
import { getCompleteSupplierConfig } from "../utils/configLoader.js";

/**
 * Transform InternalOrder to supplier-specific payload
 * This is the critical step that handles all supplier nuances
 * 
 * @param {Object} order - InternalOrder (canonical shape)
 * @param {string} environment - Environment ("production", "sandbox", "dev")
 * @returns {Object} Supplier-specific payload
 */
export function transformToSupplier(order, environment = "production") {
  const supplier = order.supplier || "ABC";
  const config = getCompleteSupplierConfig(supplier, environment);
  
  const payload = {};
  
  // Transform fields using fieldMappings
  const fieldMappings = config.fieldMappings || {};
  for (const [internalField, supplierPath] of Object.entries(fieldMappings)) {
    const value = accessor(order, internalField);
    if (value !== undefined && value !== null && value !== "") {
      // Apply enum mapping if exists
      const enumValue = applyEnumMapping(internalField, value, config);
      // Apply formatting
      const formatConfig = getFormatConfig(internalField, config);
      const formatted = formatter(enumValue !== undefined ? enumValue : value, formatConfig, internalField);
      setNestedValue(payload, supplierPath, formatted);
    }
  }
  
  // Apply defaults for missing optional fields
  const defaults = config.defaults || {};
  for (const [defaultPath, defaultValue] of Object.entries(defaults)) {
    const existingValue = accessor(payload, defaultPath);
    if (existingValue === undefined || existingValue === null || existingValue === "") {
      setNestedValue(payload, defaultPath, defaultValue);
    }
  }
  
  // Transform line items
  if (order.lineItems && order.lineItems.length > 0) {
    const lineItemMappings = config.lineItemMappings || {};
    const lines = order.lineItems.map((item, index) => {
      const supplierItem = {};
      
      // Add ID if needed (ABC requires string ID)
      if (supplier === "ABC") {
        supplierItem.id = String(index + 1);
      }
      
      // Map each field
      for (const [canonicalField, supplierField] of Object.entries(lineItemMappings)) {
        const value = item[canonicalField];
        if (value !== undefined && value !== null) {
          // Handle nested structures (e.g., orderedQty.value)
          if (supplierField.includes(".")) {
            const [parent, child] = supplierField.split(".");
            if (!supplierItem[parent]) {
              supplierItem[parent] = {};
            }
            supplierItem[parent][child] = value;
          } else {
            supplierItem[supplierField] = value;
          }
        }
      }
      
      return supplierItem;
    });
    
    // Set lines in appropriate location
    if (supplier === "ABC") {
      payload.lines = lines;
    } else if (supplier === "Beacon") {
      payload.lineItems = lines;
    } else if (supplier === "SRS") {
      payload.orderLineItemDetails = lines;
    }
  }
  
  // Handle special supplier-specific structures
  if (supplier === "ABC") {
    // ABC requires deliveryAppointment structure
    if (!payload.deliveryAppointment) {
      payload.deliveryAppointment = {};
    }
    if (!payload.deliveryAppointment.fromTime) {
      payload.deliveryAppointment.fromTime = defaults["delivery.fromTime"] || "07:00";
    }
    if (!payload.deliveryAppointment.toTime) {
      payload.deliveryAppointment.toTime = defaults["delivery.toTime"] || "17:00";
    }
    if (!payload.deliveryAppointment.instructionsTypeCode) {
      payload.deliveryAppointment.instructionsTypeCode = defaults["delivery.timeCode"] || "AT";
    }
    
    // ABC requires currency
    if (!payload.currency) {
      payload.currency = "USD";
    }
    
    // ABC requires typeCode
    if (!payload.typeCode) {
      payload.typeCode = "SO";
    }
    
    // ABC requires deliveryService
    if (!payload.deliveryService) {
      payload.deliveryService = defaults.deliveryService || "OTG";
    }
    
    // ABC requires requestId
    if (!payload.requestId && order.requestId) {
      payload.requestId = order.requestId;
    } else if (!payload.requestId) {
      payload.requestId = `req-${Date.now()}`;
    }
    
    // ABC wraps contacts in array (if contact has email)
    if (payload.shipTo) {
      if (!payload.shipTo.contacts) {
        payload.shipTo.contacts = [];
      } else if (!Array.isArray(payload.shipTo.contacts)) {
        // Convert single contact object to array
        if (payload.shipTo.contacts.email) {
          payload.shipTo.contacts = [{
            name: payload.shipTo.contacts.name || "",
            functionCode: "SM",
            email: payload.shipTo.contacts.email,
            phones: payload.shipTo.contacts.phone ? [{
              number: String(payload.shipTo.contacts.phone).replace(/\D+/g, ""),
              type: "MOBILE",
              ext: "",
            }] : [],
          }];
        } else {
          payload.shipTo.contacts = [];
        }
      }
    }
    
    // ABC wraps orderComments in array
    if (payload.orderComments) {
      if (!Array.isArray(payload.orderComments)) {
        payload.orderComments = [{
          code: "H",
          description: String(payload.orderComments).substring(0, 255),
        }];
      }
    }
    
    // Remove empty address if all fields are empty
    if (payload.shipTo && payload.shipTo.address) {
      const address = payload.shipTo.address;
      const isEmpty = !address.line1 && !address.city && !address.state && !address.postal;
      if (isEmpty) {
        delete payload.shipTo.address;
      }
    }
  }
  
  // Apply wrapper (e.g., ABC wraps in array)
  if (config.wrapper?.type === "array") {
    return [payload];
  }
  
  return payload;
}

/**
 * Apply enum mapping if configured
 */
function applyEnumMapping(fieldPath, value, config) {
  const enumMappings = config.enumMappings || {};
  
  // Check if this field has enum mapping
  for (const [mappedField, mapping] of Object.entries(enumMappings)) {
    if (fieldPath.includes(mappedField) || fieldPath.endsWith(mappedField)) {
      if (mapping[value]) {
        return mapping[value];
      }
    }
  }
  
  return undefined;
}

/**
 * Get formatting config for a field
 */
function getFormatConfig(fieldPath, config) {
  const formatting = config.formatting || {};
  
  // Check if this field has formatting rules
  for (const [formattedField, formatRules] of Object.entries(formatting)) {
    if (fieldPath.includes(formattedField) || fieldPath.endsWith(formattedField)) {
      return formatRules;
    }
  }
  
  return {};
}

