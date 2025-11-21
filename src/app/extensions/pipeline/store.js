// SHAPE: Input → Filter → Transform → Store → Output → Loop
// INPUT: InternalOrder
// FILTER: N/A
// TRANSFORM: Map to HubSpot custom object format
// STORE: Save to HubSpot
// OUTPUT: Saved order ID
// LOOP: Can store multiple orders

/**
 * Store stage: Save InternalOrder to HubSpot custom object
 * This is a placeholder - actual implementation depends on HubSpot API
 * 
 * @param {Object} order - InternalOrder
 * @param {Object} hubspotApi - HubSpot API client (optional)
 * @returns {Promise<Object>} Saved order with ID
 */
export async function storeStage(order, hubspotApi = null) {
  // This would typically:
  // 1. Map InternalOrder to HubSpot custom object properties
  // 2. Call HubSpot API to create/update order
  // 3. Return saved order with ID
  
  // For now, return order with a placeholder ID
  return {
    ...order,
    orderId: order.orderId || `order-${Date.now()}`,
    status: "Draft",
  };
}

