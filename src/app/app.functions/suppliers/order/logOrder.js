/**
 * Shape Language: Input → Filter → Transform → Store → Output → Loop
 * 
 * Input: Order payload, supplier name, stage (optional)
 * Filter: Validate payload exists
 * Transform: Format summary and full JSON
 * Store: N/A
 * Output: Console logs (summary + full JSON)
 * Loop: Can log multiple orders
 */

/**
 * Log order to console with summary and full JSON
 * 
 * @param {Object} orderPayload - Order payload to log
 * @param {string} supplier - Supplier name
 * @param {string} stage - Optional stage identifier (e.g., "before transformation", "before sending")
 */
function logOrder(orderPayload, supplier, stage = '') {
  if (!orderPayload || typeof orderPayload !== 'object') {
    console.warn('⚠️ logOrder: Invalid order payload provided');
    return;
  }

  const supplierName = supplier || 'UNKNOWN';
  const stageLabel = stage ? ` [${stage}]` : '';
  
  console.log('\n' + '='.repeat(80));
  console.log(`📦 ORDER PAYLOAD FOR ${supplierName.toUpperCase()}${stageLabel}`);
  console.log('='.repeat(80));

  // Summary section
  console.log('\n📋 ORDER SUMMARY:');
  console.log('─'.repeat(80));
  
  const items = orderPayload.fullOrderItems || orderPayload.lineItems || orderPayload.items || orderPayload.orderLineItemDetails || [];
  const delivery = orderPayload.delivery || orderPayload.shipTo || {};
  const address = delivery.address || delivery;
  
  console.log(`  Supplier:        ${supplierName}`);
  console.log(`  Order ID:        ${orderPayload.orderId || orderPayload.selectedOrderId || orderPayload.ticket || 'N/A'}`);
  console.log(`  Ticket/PO:       ${orderPayload.ticket || orderPayload.poNumber || orderPayload.purchaseOrder || 'N/A'}`);
  console.log(`  Template:        ${orderPayload.template || 'N/A'}`);
  console.log(`  Items Count:     ${items.length}`);
  console.log(`  Order Total:     $${(orderPayload.orderTotal || 0).toFixed(2)}`);
  
  // Delivery address summary
  const addressLine1 = address.address_line_1 || address.line1 || address.addressLine1 || '';
  const city = address.city || delivery.city || '';
  const state = address.state || delivery.state || '';
  const zip = address.zip_code || address.zipCode || address.postal || address.postalCode || '';
  const deliveryAddress = [addressLine1, city, state, zip].filter(Boolean).join(', ') || 'N/A';
  console.log(`  Delivery Address: ${deliveryAddress}`);
  
  // Delivery date
  let deliveryDate = delivery.delivery_date || orderPayload.delivery_date;
  if (deliveryDate && typeof deliveryDate === 'object') {
    deliveryDate = deliveryDate.formattedDate || deliveryDate.date || '';
  }
  console.log(`  Delivery Date:    ${deliveryDate || 'N/A'}`);
  
  // Items summary
  if (items.length > 0) {
    console.log(`\n  Items:`);
    items.slice(0, 5).forEach((item, idx) => {
      const sku = item.sku || item.itemNumber || item.productId || 'N/A';
      const qty = item.qty || item.quantity || item.orderedQty?.value || 0;
      const uom = item.uom || item.unitOfMeasure || item.orderedQty?.uom || '';
      const price = item.unitPrice || item.price || item.unitPrice?.value || 0;
      console.log(`    ${idx + 1}. SKU: ${sku}, Qty: ${qty} ${uom}, Price: $${price.toFixed(2)}`);
    });
    if (items.length > 5) {
      console.log(`    ... and ${items.length - 5} more item(s)`);
    }
  }

  // Full JSON section
  console.log('\n📄 FULL ORDER PAYLOAD (JSON):');
  console.log('─'.repeat(80));
  try {
    console.log(JSON.stringify(orderPayload, null, 2));
  } catch (error) {
    console.error('❌ Error stringifying order payload:', error.message);
    console.log('Raw payload:', orderPayload);
  }
  
  console.log('='.repeat(80) + '\n');
}

module.exports = {
  logOrder
};

