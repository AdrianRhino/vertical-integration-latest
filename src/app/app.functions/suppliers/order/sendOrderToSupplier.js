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

// PDF generation and upload modules (optional - gracefully handle if not available)
let generateOrderPDF, uploadPDFToHubspot;
try {
  const pdfModule = require('./generateOrderPDF');
  const uploadModule = require('./uploadPDFToHubspot');
  generateOrderPDF = pdfModule.generateOrderPDF;
  uploadPDFToHubspot = uploadModule.uploadPDFToHubspot;
} catch (error) {
  console.warn('PDF modules not available:', error.message);
  generateOrderPDF = null;
  uploadPDFToHubspot = null;
}

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
    
    // Generate PDF and return as data URL if order submission was successful
    if (result.success && generateOrderPDF) {
      try {
        const orderNumber = fullOrder.orderId || fullOrder.ticket || `ORD-${Date.now()}`;
        const fileName = `Order-${orderNumber}-${supplier.toUpperCase()}.pdf`;
        
        console.log('Generating order PDF...');
        const pdfBuffer = await generateOrderPDF(fullOrder, result);
        
        // Convert PDF buffer to base64 data URL
        const base64PDF = pdfBuffer.toString('base64');
        const pdfDataUrl = `data:application/pdf;base64,${base64PDF}`;
        
        // Log PDF data URL to console (truncated for readability)
        console.log('Order PDF Data URL (base64):', pdfDataUrl.substring(0, 100) + '...');
        console.log('Order PDF Size:', pdfBuffer.length, 'bytes');
        console.log('Full PDF Data URL available in response.pdfUrl');
        
        // Include PDF data URL in response
        result.pdfUrl = pdfDataUrl;
        result.pdfFileName = fileName;
        result.pdfSize = pdfBuffer.length;
        
      } catch (pdfError) {
        // Don't fail order submission if PDF generation fails
        console.error('PDF generation failed (order still submitted):', {
          message: pdfError.message,
          stack: pdfError.stack
        });
        result.pdfError = pdfError.message;
      }
    } else if (result.success && !generateOrderPDF) {
      console.warn('PDF generation skipped: pdfkit module not installed. Run: npm install pdfkit');
      result.pdfWarning = 'PDF generation not available - pdfkit module not installed';
    }
    
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
