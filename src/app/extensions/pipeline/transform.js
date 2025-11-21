// SHAPE: Input → Filter → Transform → Store → Output → Loop
// INPUT: InternalOrder
// FILTER: N/A
// TRANSFORM: Apply defaults, normalize types
// STORE: Return transformed InternalOrder
// OUTPUT: Normalized InternalOrder
// LOOP: Can transform multiple orders

/**
 * Transform stage: Apply defaults and normalize types
 * 
 * @param {Object} order - InternalOrder
 * @param {Object} defaults - Default values to apply
 * @returns {Object} Transformed InternalOrder
 */
export function transformStage(order, defaults = {}) {
  // Apply defaults for missing optional fields
  if (!order.delivery.fromTime && defaults["delivery.fromTime"]) {
    order.delivery.fromTime = defaults["delivery.fromTime"];
  }
  
  if (!order.delivery.toTime && defaults["delivery.toTime"]) {
    order.delivery.toTime = defaults["delivery.toTime"];
  }
  
  if (!order.delivery.timeCode && defaults["delivery.timeCode"]) {
    order.delivery.timeCode = defaults["delivery.timeCode"];
  }
  
  // Ensure line items have UOM
  if (order.lineItems) {
    order.lineItems.forEach(item => {
      if (!item.uom) {
        item.uom = "EA";
      }
    });
  }
  
  return order;
}

