// SHAPE: Input → Filter → Transform → Store → Output → Loop
// INPUT: Varying orderBody shapes, supplier name, environment
// FILTER: Validate orderBody exists, supplier config exists
// TRANSFORM: Normalize → Standard → Supplier-specific format
// STORE: Supplier-ready payload
// OUTPUT: Formatted order payload
// LOOP: Can format multiple orders for different suppliers

const path = require('path');
const fs = require('fs');
const { normalizeInput } = require('./normalizeInput');

/**
 * Get value from nested object using dot notation path
 */
function getNestedValue(obj, path) {
  if (!path) return undefined;
  return path.split('.').reduce((current, key) => {
    if (current === null || current === undefined) return undefined;
    // Handle array notation like "contacts[0]"
    const arrayMatch = key.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      const arrayKey = arrayMatch[1];
      const index = parseInt(arrayMatch[2], 10);
      return current[arrayKey] && current[arrayKey][index];
    }
    return current[key];
  }, obj);
}

/**
 * Set value in nested object using dot notation path
 */
function setNestedValue(obj, path, value) {
  if (!path) return;
  const keys = path.split('.');
  const lastKey = keys.pop();
  const target = keys.reduce((current, key) => {
    // Handle array notation like "contacts[0]"
    const arrayMatch = key.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      const arrayKey = arrayMatch[1];
      const index = parseInt(arrayMatch[2], 10);
      if (!current[arrayKey]) current[arrayKey] = [];
      if (!current[arrayKey][index]) current[arrayKey][index] = {};
      return current[arrayKey][index];
    }
    if (!current[key]) current[key] = {};
    return current[key];
  }, obj);
  target[lastKey] = value;
}

/**
 * Load supplier config from JSON file
 */
function loadSupplierConfig(supplier, environment = 'sandbox') {
  const configPath = path.join(__dirname, 'config', `${supplier.toLowerCase()}OrderConfig.json`);
  
  try {
    const configContent = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(configContent);
  } catch (error) {
    console.error(`Failed to load config for ${supplier}:`, error.message);
    return null;
  }
}

/**
 * Apply enum mapping if configured
 */
function applyEnumMapping(fieldPath, value, config) {
  if (!value) return value;
  
  const enumMappings = config.enumMappings || {};
  
  // Check if this field has enum mapping
  for (const [mappedField, mapping] of Object.entries(enumMappings)) {
    if (fieldPath.includes(mappedField) || fieldPath.endsWith(mappedField)) {
      if (mapping[value]) {
        return mapping[value];
      }
    }
  }
  
  return value;
}

/**
 * Apply special handlers (UUID generation, timestamps, etc.)
 */
function applySpecialHandler(handlerName, fieldPath, normalizedOrder) {
  switch (handlerName) {
    case 'generateUUID':
      return generateUUID();
    case 'generateTimestamp':
      return new Date().toISOString();
    case 'generateRequestId':
      return normalizedOrder.requestId || `req-${Date.now()}`;
    default:
      return null;
  }
}

/**
 * Generate UUID v4
 */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Format order for supplier API
 * 
 * @param {Object} orderBody - Raw order input (varying shapes)
 * @param {string} supplier - Supplier name ('srs', 'abc', 'beacon')
 * @param {string} environment - Environment ('sandbox', 'production')
 * @returns {Object} Supplier-formatted order payload
 */
function formatOrder(orderBody, supplier, environment = 'sandbox') {
  // Filter: Validate inputs
  if (!orderBody) {
    throw new Error('orderBody is required');
  }
  
  const supplierUpper = String(supplier || '').toUpperCase();
  const config = loadSupplierConfig(supplierUpper, environment);
  
  if (!config) {
    throw new Error(`No config found for supplier: ${supplier}`);
  }
  
  // Transform: Normalize input to standard format
  const normalizedOrder = normalizeInput(orderBody);
  if (!normalizedOrder) {
    throw new Error('Failed to normalize order input');
  }
  
  // Transform: Convert standard format to supplier-specific format
  const payload = {};
  
  // Map fields using fieldMappings
  const fieldMappings = config.fieldMappings || {};
  for (const [standardField, supplierPath] of Object.entries(fieldMappings)) {
    let value = getNestedValue(normalizedOrder, standardField);
    
    if (value !== undefined && value !== null && value !== '') {
      // Apply enum mapping
      value = applyEnumMapping(standardField, value, config);
      setNestedValue(payload, supplierPath, value);
    }
  }
  
  // Apply defaults for missing optional fields
  const defaults = config.defaults || {};
  for (const [defaultPath, defaultValue] of Object.entries(defaults)) {
    const existingValue = getNestedValue(payload, defaultPath);
    if (existingValue === undefined || existingValue === null || existingValue === '') {
      // Check if this is a special handler
      const specialHandlers = config.specialHandlers || {};
      if (specialHandlers[defaultPath]) {
        const specialValue = applySpecialHandler(specialHandlers[defaultPath], defaultPath, normalizedOrder);
        if (specialValue !== null) {
          setNestedValue(payload, defaultPath, specialValue);
        } else {
          setNestedValue(payload, defaultPath, defaultValue);
        }
      } else {
        setNestedValue(payload, defaultPath, defaultValue);
      }
    }
  }
  
  // Transform line items
  if (normalizedOrder.lineItems && normalizedOrder.lineItems.length > 0) {
    const lineItemMappings = config.lineItemMappings || {};
    const lines = normalizedOrder.lineItems.map((item, index) => {
      const supplierItem = {};
      
      // Add ID if needed (ABC requires string ID)
      if (supplierUpper === 'ABC') {
        supplierItem.id = String(index + 1);
      }
      
      // Map each field
      for (const [canonicalField, supplierField] of Object.entries(lineItemMappings)) {
        const value = item[canonicalField];
        if (value !== undefined && value !== null) {
          // Handle nested structures (e.g., orderedQty.value)
          if (supplierField.includes('.')) {
            const [parent, child] = supplierField.split('.');
            if (!supplierItem[parent]) {
              supplierItem[parent] = {};
            }
            supplierItem[parent][child] = value;
            
            // For ABC, if this is unitPrice.value, ensure instructions field exists
            if (supplierUpper === 'ABC' && parent === 'unitPrice' && child === 'value') {
              if (!supplierItem[parent].instructions) {
                supplierItem[parent].instructions = '';
              }
              if (!supplierItem[parent].uom) {
                supplierItem[parent].uom = item.uom || 'EA';
              }
            }
          } else {
            supplierItem[supplierField] = value;
          }
        }
      }
      
      // For ABC, ensure orderedQty structure exists
      if (supplierUpper === 'ABC') {
        if (!supplierItem.orderedQty) {
          supplierItem.orderedQty = {
            value: item.qty || 0,
            uom: item.uom || 'EA'
          };
        }
        // Ensure itemDescription exists (even if empty)
        if (supplierItem.itemDescription === undefined) {
          supplierItem.itemDescription = item.description || '';
        }
      }
      
      return supplierItem;
    });
    
    // Set lines in appropriate location based on supplier
    if (supplierUpper === 'ABC') {
      payload.lines = lines;
    } else if (supplierUpper === 'BEACON') {
      payload.lineItems = lines;
    } else if (supplierUpper === 'SRS') {
      payload.orderLineItemDetails = lines;
    }
  }
  
  // Handle supplier-specific special structures
  if (supplierUpper === 'ABC') {
    // ABC requires purchaseOrder (even if empty, use "N/A")
    if (!payload.purchaseOrder) {
      payload.purchaseOrder = normalizedOrder.poNumber || 'N/A';
    }
    // Truncate to 20 chars
    if (payload.purchaseOrder && payload.purchaseOrder.length > 20) {
      payload.purchaseOrder = payload.purchaseOrder.substring(0, 20);
    }
    
    // ABC requires deliveryAppointment structure
    if (!payload.deliveryAppointment) {
      payload.deliveryAppointment = {};
    }
    if (!payload.deliveryAppointment.fromTime) {
      payload.deliveryAppointment.fromTime = defaults['delivery.fromTime'] || '07:00';
    }
    if (!payload.deliveryAppointment.toTime) {
      payload.deliveryAppointment.toTime = defaults['delivery.toTime'] || '17:00';
    }
    if (!payload.deliveryAppointment.instructionsTypeCode) {
      payload.deliveryAppointment.instructionsTypeCode = defaults['delivery.timeCode'] || 'AT';
    }
    // ABC requires instructions field (even if empty)
    if (payload.deliveryAppointment.instructions === undefined) {
      payload.deliveryAppointment.instructions = normalizedOrder.delivery?.notes || '';
    }
    // Truncate to 255 chars
    if (payload.deliveryAppointment.instructions && payload.deliveryAppointment.instructions.length > 255) {
      payload.deliveryAppointment.instructions = payload.deliveryAppointment.instructions.substring(0, 255);
    }
    
    // ABC requires currency
    if (!payload.currency) {
      payload.currency = 'USD';
    }
    
    // ABC requires typeCode
    if (!payload.typeCode) {
      payload.typeCode = 'SO';
    }
    
    // ABC requires deliveryService
    if (!payload.deliveryService) {
      payload.deliveryService = defaults.deliveryService || 'OTG';
    }
    
    // ABC requires requestId
    if (!payload.requestId && normalizedOrder.requestId) {
      payload.requestId = normalizedOrder.requestId;
    } else if (!payload.requestId) {
      payload.requestId = `req-${Date.now()}`;
    }
    
    // ABC requires shipTo.address with all required fields (even if empty)
    if (payload.shipTo) {
      if (!payload.shipTo.address) {
        payload.shipTo.address = {};
      }
      // Ensure all required address fields exist (even if empty)
      if (payload.shipTo.address.line1 === undefined) payload.shipTo.address.line1 = '';
      if (payload.shipTo.address.line2 === undefined) payload.shipTo.address.line2 = '';
      if (payload.shipTo.address.line3 === undefined) payload.shipTo.address.line3 = '';
      if (payload.shipTo.address.city === undefined) payload.shipTo.address.city = '';
      if (payload.shipTo.address.state === undefined) payload.shipTo.address.state = '';
      if (payload.shipTo.address.postal === undefined) payload.shipTo.address.postal = '';
      if (payload.shipTo.address.country === undefined) payload.shipTo.address.country = 'USA';
      
      // ABC wraps contacts in array (if contact has email)
      if (!payload.shipTo.contacts) {
        payload.shipTo.contacts = [];
      } else if (!Array.isArray(payload.shipTo.contacts)) {
        // Convert single contact object to array
        if (payload.shipTo.contacts.email) {
          payload.shipTo.contacts = [{
            name: payload.shipTo.contacts.name || '',
            functionCode: 'SM',
            email: payload.shipTo.contacts.email,
            phones: payload.shipTo.contacts.phone ? [{
              number: String(payload.shipTo.contacts.phone).replace(/\D+/g, ''),
              type: 'MOBILE',
              ext: ''
            }] : []
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
          code: 'H',
          description: String(payload.orderComments).substring(0, 255)
        }];
      }
    }
    
    // Ensure unitPrice has instructions field for all line items
    if (payload.lines && Array.isArray(payload.lines)) {
      payload.lines.forEach(line => {
        if (line.unitPrice && typeof line.unitPrice === 'object') {
          // unitPrice already exists as object, ensure instructions field
          if (line.unitPrice.instructions === undefined) {
            line.unitPrice.instructions = '';
          }
        } else if (line.unitPrice !== undefined) {
          // unitPrice is a value, convert to object structure
          line.unitPrice = {
            value: line.unitPrice,
            uom: line.orderedQty?.uom || 'EA',
            instructions: ''
          };
        }
      });
    }
  } else if (supplierUpper === 'SRS') {
    // SRS-specific structures
    if (!payload.shipTo) {
      payload.shipTo = {};
    }
    // Ensure shipTo has all required fields
    if (payload.shipTo.addressLine1 === undefined) payload.shipTo.addressLine1 = '';
    if (payload.shipTo.addressLine2 === undefined) payload.shipTo.addressLine2 = '';
    if (payload.shipTo.addressLine3 === undefined) payload.shipTo.addressLine3 = '';
    if (payload.shipTo.city === undefined) payload.shipTo.city = '';
    if (payload.shipTo.state === undefined) payload.shipTo.state = '';
    if (payload.shipTo.zipCode === undefined) payload.shipTo.zipCode = '';
    
    // Ensure customerContactInfo structure
    if (!payload.customerContactInfo) {
      payload.customerContactInfo = {};
    }
    if (!payload.customerContactInfo.customerContactAddress) {
      payload.customerContactInfo.customerContactAddress = {};
    }
    if (!payload.customerContactInfo.additionalContactEmails) {
      payload.customerContactInfo.additionalContactEmails = [];
    }
    
    // Ensure poDetails structure
    if (!payload.poDetails) {
      payload.poDetails = {};
    }
  }
  
  // Apply wrapper (e.g., ABC wraps in array)
  if (config.wrapper?.type === 'array') {
    return [payload];
  }
  
  return payload;
}

module.exports = {
  formatOrder
};

