// SHAPE: Input → Filter → Transform → Store → Output → Loop
// INPUT: Type definitions for canonical order shape
// FILTER: N/A (types only)
// TRANSFORM: N/A (types only)
// STORE: Type definitions
// OUTPUT: Exported types
// LOOP: Types used throughout system

/**
 * Canonical Internal Order Model
 * This is the single source of truth - all orders flow through this shape
 * before being transformed to supplier-specific formats
 */

/**
 * InternalOrder - Canonical order shape
 * @typedef {Object} InternalOrder
 * @property {"ABC"|"Beacon"|"SRS"} supplier - Supplier identifier
 * @property {string} accountNumber - Account number (required)
 * @property {string} branchId - Branch/warehouse identifier (required)
 * @property {"Draft"|"Priced"|"Submitted"} status - Order status
 * @property {string} [poNumber] - Purchase order number
 * @property {string} [jobName] - Job name
 * @property {string} [jobNumber] - Job number
 * @property {DeliveryInfo} delivery - Delivery information
 * @property {CanonicalLineItem[]} lineItems - Order line items
 * @property {string} [requestId] - Request/order ID
 */

/**
 * DeliveryInfo - Delivery details
 * @typedef {Object} DeliveryInfo
 * @property {"Delivery"|"Pickup"} method - Delivery method
 * @property {string} date - Delivery date (YYYY-MM-DD)
 * @property {string} timeCode - Time window code ("Anytime", "Morning", etc.)
 * @property {string} [fromTime] - Start time (HH:MM)
 * @property {string} [toTime] - End time (HH:MM)
 * @property {Address} address - Delivery address
 * @property {Contact} contact - Contact information
 * @property {string} [notes] - Delivery notes
 */

/**
 * Address - Address structure
 * @typedef {Object} Address
 * @property {string} line1 - Address line 1
 * @property {string} city - City
 * @property {string} state - State
 * @property {string} postalCode - Postal/ZIP code
 */

/**
 * Contact - Contact information
 * @typedef {Object} Contact
 * @property {string} name - Contact name
 * @property {string} phone - Phone number
 * @property {string} email - Email address
 */

/**
 * CanonicalLineItem - Standardized line item shape
 * @typedef {Object} CanonicalLineItem
 * @property {string} sku - SKU/item code (required)
 * @property {string} [name] - Item name
 * @property {string} [description] - Item description
 * @property {string} uom - Unit of measure (required)
 * @property {number} qty - Quantity (required, > 0)
 * @property {number} [price] - Unit price
 * @property {string} [variant] - Variant/option
 * @property {string} [category] - Category
 */

/**
 * Create empty InternalOrder with defaults
 * @param {Partial<InternalOrder>} partial - Partial order data
 * @returns {InternalOrder} Complete InternalOrder with defaults
 */
export function makeInternalOrder(partial = {}) {
  return {
    supplier: partial.supplier || "ABC",
    accountNumber: partial.accountNumber || "",
    branchId: partial.branchId || "",
    status: partial.status || "Draft",
    poNumber: partial.poNumber || "",
    jobName: partial.jobName || "",
    jobNumber: partial.jobNumber || "",
    delivery: {
      method: partial.delivery?.method || "Delivery",
      date: partial.delivery?.date || "",
      timeCode: partial.delivery?.timeCode || "Anytime",
      fromTime: partial.delivery?.fromTime || "",
      toTime: partial.delivery?.toTime || "",
      address: {
        line1: partial.delivery?.address?.line1 || "",
        city: partial.delivery?.address?.city || "",
        state: partial.delivery?.address?.state || "",
        postalCode: partial.delivery?.address?.postalCode || "",
      },
      contact: {
        name: partial.delivery?.contact?.name || "",
        phone: partial.delivery?.contact?.phone || "",
        email: partial.delivery?.contact?.email || "",
      },
      notes: partial.delivery?.notes || "",
    },
    lineItems: Array.isArray(partial.lineItems) ? partial.lineItems : [],
    requestId: partial.requestId || "",
  };
}

/**
 * Create empty CanonicalLineItem with defaults
 * @param {Partial<CanonicalLineItem>} partial - Partial line item data
 * @returns {CanonicalLineItem} Complete line item with defaults
 */
export function makeCanonicalLineItem(partial = {}) {
  return {
    sku: partial.sku || "",
    name: partial.name || "",
    description: partial.description || "",
    uom: partial.uom || "EA",
    qty: Number(partial.qty) || 0,
    price: partial.price !== undefined ? Number(partial.price) : undefined,
    variant: partial.variant || "",
    category: partial.category || "",
  };
}

