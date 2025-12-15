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

// Order preparation and logging modules
const { prepareOrder } = require('./prepareOrder');
const { logOrder } = require('./logOrder');

// Retry utility for order submissions
const { retryOrderSubmission } = require('./retryOrderSubmission');

// File system and path modules for loading configs
const path = require('path');
const fs = require('fs');

/**
 * Load supplier config from JSON file
 * @param {string} supplier - Supplier name
 * @param {string} environment - Environment ('sandbox', 'production')
 * @returns {Object|null} Supplier config or null if not found
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
  // Track start time for timeout management (HubSpot has 10-second timeout)
  const startTime = Date.now();
  const getElapsedTime = () => Date.now() - startTime;
  
  try {
    const { fullOrder, parsedOrder, environment, dealId } = context.parameters || {};
    
    // Filter: Validate fullOrder exists
    if (!fullOrder) {
      return {
        statusCode: 400,
        body: {
          success: false,
          message: 'Missing fullOrder parameter',
          error: 'fullOrder is required to place an order'
        }
      };
    }
    
    // Transform: Prepare unified order from fullOrder and parsedOrder
    const unifiedOrder = prepareOrder(fullOrder, parsedOrder || {}, environment);
    
    // Filter: Validate supplier exists
    const supplier = unifiedOrder.supplier;
    if (!supplier) {
      return {
        statusCode: 400,
        body: {
          success: false,
          message: 'Missing supplier in order',
          error: 'Order supplier is required to route to correct supplier'
        }
      };
    }
    
    console.log(`Routing order to supplier: ${supplier}`);
    
    // Log order before routing to supplier
    logOrder(unifiedOrder, supplier, 'before routing to supplier');
    
    // Transform: Get appropriate order function from registry
    const orderFunction = getOrderFunction(supplier);
    
    // Transform: Prepare context for supplier order function
    // Pass unified order as orderBody and include environment if provided
    // IMPORTANT: useTestPayload is always false for production orders - only test orders should use hardcoded payloads
    const supplierContext = {
      parameters: {
        orderBody: unifiedOrder,
        environment: environment || null,
        useTestPayload: false // Always use dynamic order data from UI, never hardcoded test payloads
      }
    };
    
    // Load retry configuration from supplier config
    const supplierConfig = loadSupplierConfig(supplier, environment || 'sandbox');
    const retryConfig = supplierConfig?.retry || {
      maxAttempts: 3,
      initialDelayMs: 1000,
      maxDelayMs: 5000,
      backoffMultiplier: 2,
      retriableErrorPatterns: [],
      nonRetriableErrorPatterns: []
    };
    
    console.log(`Retry configuration for ${supplier}:`, {
      maxAttempts: retryConfig.maxAttempts,
      initialDelayMs: retryConfig.initialDelayMs,
      hasRetriablePatterns: (retryConfig.retriableErrorPatterns || []).length > 0,
      hasNonRetriablePatterns: (retryConfig.nonRetriableErrorPatterns || []).length > 0
    });
    
    // Output: Call supplier-specific order function with retry logic
    const result = await retryOrderSubmission(orderFunction, supplierContext, retryConfig);
    
    console.log(`Order submission result for ${supplier}:`, {
      success: result.success,
      message: result.message,
      confirmationNumber: result.confirmationNumber,
      elapsedTimeMs: getElapsedTime()
    });
    
    // PDF generation/upload is now handled by a separate serverless function
    // This ensures order submission completes quickly and PDF generation doesn't cause timeouts
    result.pdfGenerationNote = 'PDF will be generated separately via generateAndUploadOrderPDF function';
    
    // Log final result before returning
    console.log("=== sendOrderToSupplier FINAL RESULT ===");
    console.log(`Total execution time: ${getElapsedTime()}ms`);
    console.log("Result keys:", Object.keys(result));
    console.log("Result success:", result.success);
    console.log("Full result:", JSON.stringify(result, null, 2));
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/b131dc2d-5624-4f61-98fb-efc543f7726a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sendOrderToSupplier.js:160',message:'ORDER_SUBMISSION_COMPLETE',data:{success:result.success,confirmationNumber:result.confirmationNumber,elapsedTimeMs:getElapsedTime()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{});
    // #endregion
    
    // Return in proper serverless function format
    return {
      statusCode: 200,
      body: result
    };
    
  } catch (error) {
    console.error('Error in sendOrderToSupplier:', {
      message: error.message,
      stack: error.stack,
      parameters: context.parameters
    });
    
    return {
      statusCode: 500,
      body: {
        success: false,
        message: 'Failed to send order to supplier',
        error: error.message || 'Unknown error occurred'
      }
    };
  }
};

// Legacy PDF generation code removed - now handled by separate generateAndUploadOrderPDF function
// This was removed to prevent timeout issues:
// - PDF generation/upload moved to separate serverless function
// - Order submission completes quickly without PDF blocking
// - PDF can be generated asynchronously after order submission
