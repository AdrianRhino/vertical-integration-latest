/**
 * Shape Language: Input → Filter → Transform → Store → Output → Loop
 * 
 * Input: fullOrder, parsedOrder (optional), environment
 * Filter: Prefer fullOrder, fallback to parsedOrder if fullOrder missing fields
 * Transform: Merge sources, normalize, validate required fields
 * Store: Unified order object
 * Output: Unified order ready for supplier transformation
 * Loop: Safe to call multiple times, idempotent
 */

/**
 * Prepare unified order from fullOrder and parsedOrder
 * Prefers fullOrder, falls back to parsedOrder for missing fields
 * 
 * @param {Object} fullOrder - Primary order source from HubSpot/UI
 * @param {Object} parsedOrder - Optional parsed order data (fallback)
 * @param {string} environment - Optional environment (sandbox/production)
 * @returns {Object} Unified order object
 */
function prepareOrder(fullOrder = {}, parsedOrder = {}, environment = null) {
  // Filter: Validate inputs
  if (!fullOrder || typeof fullOrder !== 'object') {
    fullOrder = {};
  }
  if (!parsedOrder || typeof parsedOrder !== 'object') {
    parsedOrder = {};
  }

  // Transform: Merge sources with fullOrder taking precedence
  // Use parsedOrder as fallback for any missing fields in fullOrder
  const unifiedOrder = {
    // Core identifiers - prefer fullOrder
    supplier: fullOrder.supplier || parsedOrder.supplier || '',
    ticket: fullOrder.ticket || parsedOrder.ticket || '',
    template: fullOrder.template || parsedOrder.template || '',
    orderType: fullOrder.orderType || parsedOrder.orderType || '',
    orderId: fullOrder.orderId || fullOrder.selectedOrderId || parsedOrder.orderId || parsedOrder.selectedOrderId || '',
    selectedOrderId: fullOrder.selectedOrderId || fullOrder.orderId || parsedOrder.selectedOrderId || parsedOrder.orderId || '',
    orderNumber: fullOrder.orderNumber || parsedOrder.orderNumber || '',
    orderStatus: fullOrder.orderStatus || parsedOrder.orderStatus || '',
    
    // Items - prefer fullOrder
    fullOrderItems: fullOrder.fullOrderItems || parsedOrder.fullOrderItems || [],
    templateItems: fullOrder.templateItems || parsedOrder.templateItems || [],
    
    // Delivery - merge nested objects
    delivery: mergeDelivery(
      fullOrder.delivery || {},
      parsedOrder.delivery || {}
    ),
    
    // Financial
    orderTotal: fullOrder.orderTotal || parsedOrder.orderTotal || 0,
    
    // Address snapshot
    addressSnapshot: fullOrder.addressSnapshot || parsedOrder.addressSnapshot || {},
    placed_order_address: fullOrder.placed_order_address || parsedOrder.placed_order_address || '',
    
    // Additional metadata
    requestId: fullOrder.requestId || parsedOrder.requestId || '',
    accountNumber: fullOrder.accountNumber || parsedOrder.accountNumber || '',
    branchId: fullOrder.branchId || parsedOrder.branchId || '',
    poNumber: fullOrder.poNumber || parsedOrder.poNumber || fullOrder.ticket || parsedOrder.ticket || '',
    jobName: fullOrder.jobName || parsedOrder.jobName || '',
    jobNumber: fullOrder.jobNumber || parsedOrder.jobNumber || '',
    
    // Preserve any additional fields from fullOrder
    ...Object.keys(fullOrder).reduce((acc, key) => {
      if (!acc[key] && fullOrder[key] !== undefined && fullOrder[key] !== null) {
        acc[key] = fullOrder[key];
      }
      return acc;
    }, {})
  };

  // Add environment if provided
  if (environment) {
    unifiedOrder.environment = environment;
  }

  return unifiedOrder;
}

/**
 * Merge delivery objects with fullOrder taking precedence
 * 
 * @param {Object} fullDelivery - Delivery from fullOrder
 * @param {Object} parsedDelivery - Delivery from parsedOrder (fallback)
 * @returns {Object} Merged delivery object
 */
function mergeDelivery(fullDelivery = {}, parsedDelivery = {}) {
  // Merge address fields
  const address = {
    address_line_1: fullDelivery.address_line_1 || parsedDelivery.address_line_1 || fullDelivery.address?.line1 || parsedDelivery.address?.line1 || '',
    address_line_2: fullDelivery.address_line_2 || parsedDelivery.address_line_2 || fullDelivery.address?.line2 || parsedDelivery.address?.line2 || '',
    address_line_3: fullDelivery.address_line_3 || parsedDelivery.address_line_3 || fullDelivery.address?.line3 || parsedDelivery.address?.line3 || '',
    city: fullDelivery.city || parsedDelivery.city || fullDelivery.address?.city || parsedDelivery.address?.city || '',
    state: fullDelivery.state || parsedDelivery.state || fullDelivery.address?.state || parsedDelivery.address?.state || '',
    zip_code: fullDelivery.zip_code || parsedDelivery.zip_code || fullDelivery.address?.postalCode || parsedDelivery.address?.postal || '',
  };

  // Merge delivery date (handle both object and string formats)
  let deliveryDate = fullDelivery.delivery_date || parsedDelivery.delivery_date;
  if (deliveryDate && typeof deliveryDate === 'object') {
    deliveryDate = deliveryDate.formattedDate || deliveryDate.date || '';
  }

  return {
    ...fullDelivery,
    ...parsedDelivery,
    ...address,
    delivery_date: deliveryDate || parsedDelivery.delivery_date || '',
    delivery_type: fullDelivery.delivery_type || parsedDelivery.delivery_type || '',
    primary_contact: fullDelivery.primary_contact || parsedDelivery.primary_contact || '',
    primary_contact_name: fullDelivery.primary_contact_name || parsedDelivery.primary_contact_name || '',
    primary_contact_email: fullDelivery.primary_contact_email || parsedDelivery.primary_contact_email || '',
    delivery_instructions: fullDelivery.delivery_instructions || parsedDelivery.delivery_instructions || '',
    time_code: fullDelivery.time_code || parsedDelivery.time_code || '',
    fromTime: fullDelivery.fromTime || parsedDelivery.fromTime || '',
    toTime: fullDelivery.toTime || parsedDelivery.toTime || '',
  };
}

module.exports = {
  prepareOrder
};

