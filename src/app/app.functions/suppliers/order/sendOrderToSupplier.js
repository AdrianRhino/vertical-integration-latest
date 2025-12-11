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
      confirmationNumber: result.confirmationNumber
    });
    
    // Generate PDF and upload to HubSpot (even if order submission failed, to document the attempt)
    // This ensures we always have a PDF record of the order attempt
    if (generateOrderPDF) {
      try {
        const orderNumber = unifiedOrder.orderId || unifiedOrder.ticket || `ORD-${Date.now()}`;
        const fileName = `Order-${orderNumber}-${supplier.toUpperCase()}.pdf`;
        
        console.log('=== PDF GENERATION START ===');
        console.log('Order details:', {
          orderNumber,
          fileName,
          supplier,
          orderSuccess: result.success,
          orderMessage: result.message,
          hasItems: !!unifiedOrder.fullOrderItems && unifiedOrder.fullOrderItems.length > 0,
          itemsCount: unifiedOrder.fullOrderItems?.length || 0,
          hasDelivery: !!unifiedOrder.delivery,
          orderId: unifiedOrder.orderId,
          ticket: unifiedOrder.ticket,
          confirmationNumber: result.confirmationNumber || 'N/A'
        });
        
        console.log('Generating order PDF...');
        const pdfBuffer = await generateOrderPDF(unifiedOrder, result);
        
        if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer)) {
          throw new Error(`PDF generation returned invalid buffer. Type: ${typeof pdfBuffer}, isBuffer: ${Buffer.isBuffer(pdfBuffer)}`);
        }
        
        console.log('✅ PDF generated successfully. Size:', pdfBuffer.length, 'bytes');
        
        // Upload PDF to HubSpot Files API if uploadPDFToHubspot is available
        if (uploadPDFToHubspot) {
          try {
            const orderId = unifiedOrder.orderId || unifiedOrder.selectedOrderId || null;
            
            console.log('=== ATTEMPTING PDF UPLOAD TO HUBSPOT ===');
            console.log('Upload parameters:', {
              fileName,
              orderId,
              dealId,
              pdfSize: pdfBuffer.length,
              bufferType: Buffer.isBuffer(pdfBuffer) ? 'Buffer' : typeof pdfBuffer
            });
            
            const uploadResult = await uploadPDFToHubspot(
              pdfBuffer, 
              fileName, 
              orderId, 
              dealId
            );
            
            console.log('=== PDF UPLOAD RESULT ===');
            console.log('Full upload result:', JSON.stringify(uploadResult, null, 2));
            console.log('Upload result keys:', uploadResult ? Object.keys(uploadResult) : 'null');
            console.log('Has URL:', !!uploadResult?.url);
            console.log('URL value:', uploadResult?.url);
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/b131dc2d-5624-4f61-98fb-efc543f7726a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sendOrderToSupplier.js:176',message:'UPLOAD_RESULT_CHECK',data:{hasUploadResult:!!uploadResult,hasUrl:!!uploadResult?.url,hasAppUrl:!!uploadResult?.appUrl,urlKeys:uploadResult?Object.keys(uploadResult):null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H2,H6'})}).catch(()=>{});
            // #endregion
            
            if (uploadResult && (uploadResult.url || uploadResult.appUrl)) {
              // Prefer appUrl (HubSpot app format) over CDN URL for order_pdf property
              result.pdfUrl = uploadResult.appUrl || uploadResult.url; // HubSpot app URL format for order_pdf
              result.pdfFileId = uploadResult.fileId;
              result.pdfCdnUrl = uploadResult.url; // Keep CDN URL for reference
              console.log('✅ PDF uploaded successfully to HubSpot');
              console.log('📎 App URL (for order_pdf):', result.pdfUrl);
              console.log('📎 CDN URL (reference):', result.pdfCdnUrl);
              
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/b131dc2d-5624-4f61-98fb-efc543f7726a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sendOrderToSupplier.js:185',message:'PDF_URL_SET',data:{pdfUrl:result.pdfUrl,hasPdfUrl:!!result.pdfUrl,pdfUrlType:typeof result.pdfUrl,appUrl:uploadResult?.appUrl,url:uploadResult?.url?.substring(0,100)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H2,H5'})}).catch(()=>{});
              // #endregion
            } else {
              // Fall back to data URL if upload didn't return URL
              console.error('❌ PDF upload did not return a URL');
              console.error('Upload result structure:', uploadResult);
              const base64PDF = pdfBuffer.toString('base64');
              result.pdfUrl = `data:application/pdf;base64,${base64PDF}`;
              result.pdfUploadFailed = true;
              result.pdfUploadError = 'Upload succeeded but no URL returned';
              console.warn('⚠️ Falling back to data URL. Upload result:', uploadResult);
            }
          } catch (uploadError) {
            console.error('❌ PDF UPLOAD FAILED WITH ERROR');
            console.error('Error message:', uploadError.message);
            console.error('Error stack:', uploadError.stack);
            console.error('Full error:', JSON.stringify(uploadError, Object.getOwnPropertyNames(uploadError), 2));
            
            // Fall back to data URL if upload fails
            const base64PDF = pdfBuffer.toString('base64');
            result.pdfUrl = `data:application/pdf;base64,${base64PDF}`;
            result.pdfUploadFailed = true;
            result.pdfUploadError = uploadError.message;
            console.warn('⚠️ Falling back to data URL due to upload error');
          }
        } else {
          // Fall back to data URL if upload module not available
          console.warn('⚠️ PDF upload module (uploadPDFToHubspot) is not available');
          const base64PDF = pdfBuffer.toString('base64');
          result.pdfUrl = `data:application/pdf;base64,${base64PDF}`;
          result.pdfUploadFailed = true;
          result.pdfUploadError = 'Upload module not available';
        }
        
        result.pdfFileName = fileName;
        result.pdfSize = pdfBuffer.length;
        
      } catch (pdfError) {
        // Don't fail order submission if PDF generation fails
        console.error('=== PDF GENERATION FAILED ===');
        console.error('Error message:', pdfError.message);
        console.error('Error stack:', pdfError.stack);
        console.error('Error name:', pdfError.name);
        console.error('Full error object:', JSON.stringify(pdfError, Object.getOwnPropertyNames(pdfError), 2));
        console.error('Unified order structure:', {
          hasFullOrderItems: !!unifiedOrder.fullOrderItems,
          fullOrderItemsLength: unifiedOrder.fullOrderItems?.length || 0,
          hasDelivery: !!unifiedOrder.delivery,
          supplier: unifiedOrder.supplier,
          orderId: unifiedOrder.orderId,
          ticket: unifiedOrder.ticket,
          keys: Object.keys(unifiedOrder)
        });
        
        result.pdfError = pdfError.message;
        result.pdfErrorStack = pdfError.stack;
        result.pdfErrorName = pdfError.name;
      }
    } else if (!generateOrderPDF) {
      console.warn('PDF generation skipped: pdfkit module not installed. Run: npm install pdfkit');
      result.pdfWarning = 'PDF generation not available - pdfkit module not installed';
    }
    
    // Log final result before returning
    console.log("=== sendOrderToSupplier FINAL RESULT ===");
    console.log("Result keys:", Object.keys(result));
    console.log("PDF URL in result:", result.pdfUrl);
    console.log("Result success:", result.success);
    console.log("Full result:", JSON.stringify(result, null, 2));
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/b131dc2d-5624-4f61-98fb-efc543f7726a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sendOrderToSupplier.js:240',message:'FINAL_RESULT',data:{hasPdfUrl:!!result.pdfUrl,pdfUrl:result.pdfUrl,resultKeys:Object.keys(result),success:result.success},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3,H5'})}).catch(()=>{});
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
