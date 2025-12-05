/**
 * Shape Language: Input → Filter → Transform → Store → Output → Loop
 * 
 * Input: Context with fullOrder parameter
 * Filter: Validates fullOrder exists and has supplier
 * Transform: Routes to appropriate supplier order function via registry
 * Store: N/A
 * Output: Order submission response from supplier API
 * Loop: Self-healing - validates supplier and routes correctly
 */

// Supplier order function registry
const ORDER_FUNCTIONS = {
  'abc': require('./abcOrder'),
  'srs': require('./srsOrder'),
  'beacon': require('./beaconOrder'),
  // Add new suppliers here as they're added
};

/**
 * Get order function for supplier
 * @param {string} supplier - Supplier name (case-insensitive)
 * @returns {Function} Order function
 */
function getOrderFunction(supplier) {
  if (!supplier) {
    throw new Error('Supplier is required');
  }
  
  const supplierLower = String(supplier).toLowerCase();
  const orderFunction = ORDER_FUNCTIONS[supplierLower];
  
  if (!orderFunction) {
    const availableSuppliers = Object.keys(ORDER_FUNCTIONS).join(', ');
    throw new Error(`Unknown supplier: ${supplier}. Available suppliers: ${availableSuppliers}`);
  }
  
  return orderFunction;
}

exports.main = async (context = {}) => {
  try {
    const { fullOrder, environment } = context.parameters || {};
    
    // Filter: Validate fullOrder exists
    if (!fullOrder) {
      return {
        success: false,
        message: 'Missing fullOrder parameter',
        error: 'fullOrder is required to place an order'
      };
    }
    
    // Filter: Validate supplier exists
    const supplier = fullOrder.supplier;
    if (!supplier) {
      return {
        success: false,
        message: 'Missing supplier in fullOrder',
        error: 'fullOrder.supplier is required to route to correct supplier'
      };
    }
    
    console.log(`Routing order to supplier: ${supplier}`);
    console.log('Full order structure:', {
      supplier: fullOrder.supplier,
      hasItems: !!fullOrder.fullOrderItems,
      itemsCount: fullOrder.fullOrderItems?.length || 0,
      hasDelivery: !!fullOrder.delivery,
      orderStatus: fullOrder.orderStatus
    });
    
    // Transform: Get appropriate order function from registry
    const orderFunction = getOrderFunction(supplier);
    
    // Transform: Prepare context for supplier order function
    // Pass fullOrder as orderBody and include environment if provided
    const supplierContext = {
      parameters: {
        orderBody: fullOrder,
        environment: environment || null
      }
    };
    
    // Output: Call supplier-specific order function
    const result = await orderFunction.main(supplierContext);
    
    console.log(`Order submission result for ${supplier}:`, {
      success: result.success,
      message: result.message,
      confirmationNumber: result.confirmationNumber
    });
    
    return result;
    
  } catch (error) {
    console.error('Error in sendOrderToSupplier:', {
      message: error.message,
      stack: error.stack,
      parameters: context.parameters
    });
    
    return {
      success: false,
      message: 'Failed to send order to supplier',
      error: error.message || 'Unknown error occurred'
    };
  }
};
