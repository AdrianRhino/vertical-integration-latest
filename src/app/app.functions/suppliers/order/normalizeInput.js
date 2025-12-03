// SHAPE: Input → Filter → Transform → Store → Output → Loop
// INPUT: Varying orderBody shapes from different sources
// FILTER: Validate orderBody exists and has basic structure
// TRANSFORM: Convert varying input shapes to standard format
// STORE: Standardized order object
// OUTPUT: Normalized order ready for supplier transformation
// LOOP: Can normalize multiple orders

/**
 * Normalize varying input order shapes to standard format
 * Handles different field naming conventions and structures
 * 
 * @param {Object} orderBody - Raw order input (varying shapes)
 * @returns {Object} Normalized order in standard format
 */
function normalizeInput(orderBody) {
  if (!orderBody || typeof orderBody !== 'object') {
    return null;
  }

  // Standard format structure
  const normalized = {
    supplier: orderBody.supplier || '',
    accountNumber: orderBody.accountNumber || '',
    branchId: orderBody.branchId || '',
    poNumber: orderBody.poNumber || orderBody.ticket || '',
    jobName: orderBody.jobName || '',
    jobNumber: orderBody.jobNumber || '',
    delivery: normalizeDelivery(orderBody.delivery || {}),
    lineItems: normalizeLineItems(orderBody.fullOrderItems || orderBody.lineItems || orderBody.items || []),
    requestId: orderBody.requestId || orderBody.ticket || '',
    orderType: orderBody.orderType || '',
    template: orderBody.template || '',
    orderTotal: orderBody.orderTotal || 0
  };

  return normalized;
}

/**
 * Normalize delivery information from various formats
 */
function normalizeDelivery(delivery) {
  if (!delivery || typeof delivery !== 'object') {
    return {
      method: 'Delivery',
      date: '',
      timeCode: 'Anytime',
      fromTime: '',
      toTime: '',
      address: {
        line1: '',
        line2: '',
        line3: '',
        city: '',
        state: '',
        postalCode: ''
      },
      contact: {
        name: '',
        phone: '',
        email: ''
      },
      notes: ''
    };
  }

  // Handle date formatting (can be object with year/month/date or string)
  let deliveryDate = '';
  if (delivery.delivery_date) {
    if (typeof delivery.delivery_date === 'object' && delivery.delivery_date.formattedDate) {
      // Convert formattedDate (MM/DD/YYYY) to YYYY-MM-DD
      const parts = delivery.delivery_date.formattedDate.split('/');
      if (parts.length === 3) {
        deliveryDate = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
      }
    } else if (typeof delivery.delivery_date === 'string') {
      deliveryDate = delivery.delivery_date;
    }
  } else if (delivery.date) {
    deliveryDate = delivery.date;
  }

  // Normalize address - handle both address_line_1 and address.line1 formats
  const address = {
    line1: delivery.address_line_1 || delivery.address?.line1 || delivery.addressLine1 || '',
    line2: delivery.address_line_2 || delivery.address?.line2 || delivery.addressLine2 || '',
    line3: delivery.address_line_3 || delivery.address?.line3 || delivery.addressLine3 || '',
    city: delivery.city || delivery.address?.city || '',
    state: delivery.state || delivery.address?.state || '',
    postalCode: delivery.zip_code || delivery.zipCode || delivery.address?.postalCode || delivery.address?.postal || ''
  };

  // Normalize contact
  const contact = {
    name: delivery.contact?.name || delivery.primary_contact_name || '',
    phone: delivery.primary_contact || delivery.contact?.phone || '',
    email: delivery.contact?.email || delivery.primary_contact_email || ''
  };

  return {
    method: delivery.delivery_type === 'roofDrop' ? 'Delivery' : (delivery.method || 'Delivery'),
    date: deliveryDate,
    timeCode: delivery.time_code || delivery.timeCode || 'Anytime',
    fromTime: delivery.fromTime || '',
    toTime: delivery.toTime || '',
    address: address,
    contact: contact,
    notes: delivery.notes || delivery.instructions || ''
  };
}

/**
 * Normalize line items from various formats
 */
function normalizeLineItems(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.map((item, index) => {
    // Handle different SKU field names
    const sku = item.sku || item.itemNumber || item.productId || item.customerItem || '';
    
    // Handle different quantity field names
    const qty = item.qty || item.quantity || item.orderedQty?.value || 0;
    
    // Handle different UOM field names
    const uom = item.uom || item.orderedQty?.uom || item.unitOfMeasure || 'EA';
    
    // Handle different price field names
    const price = item.unitPrice || item.price || item.unitPrice?.value || 0;
    
    // Handle different title/name/description fields
    const title = item.title || item.name || item.productName || item.itemDescription || item.description || '';
    
    // Handle productId (may be string or number)
    const productId = item.productId !== undefined ? item.productId : null;

    return {
      sku: String(sku),
      name: title,
      description: item.description || title,
      qty: Number(qty) || 0,
      uom: String(uom),
      price: Number(price) || 0,
      productId: productId !== null ? (typeof productId === 'number' ? productId : Number(productId) || null) : null,
      variant: item.variant || item.option || '',
      category: item.category || '',
      pricingError: item.pricingError || null
    };
  }).filter(item => item.sku); // Filter out items without SKU
}

module.exports = {
  normalizeInput
};

