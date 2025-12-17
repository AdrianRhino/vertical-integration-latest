/**
 * Shape Language: Input → Filter → Transform → Store → Output → Loop
 * 
 * Input: Context with fullOrder, orderResult, orderId, dealId
 * Filter: Validates required parameters exist
 * Transform: Generates PDF from order data
 * Store: Uploads PDF to HubSpot Files API
 * Output: PDF URL and metadata
 * Loop: Self-healing - handles errors gracefully
 */

const { generateOrderPDF } = require('./generateOrderPDF');
const { uploadPDFToHubspot } = require('./uploadPDFToHubspot');
const { prepareOrder } = require('./prepareOrder');

exports.main = async (context = {}) => {
  try {
    const { fullOrder, parsedOrder, orderResult, orderId, dealId, environment } = context.parameters || {};
    
    // Filter: Validate fullOrder exists
    if (!fullOrder) {
      return {
        statusCode: 400,
        body: {
          success: false,
          error: 'fullOrder is required for PDF generation'
        }
      };
    }
    
    // Transform: Prepare unified order from fullOrder and parsedOrder
    const unifiedOrder = prepareOrder(fullOrder, parsedOrder || {}, environment);
    
    const supplier = unifiedOrder.supplier || 'UNKNOWN';
    const orderNumber = unifiedOrder.orderId || unifiedOrder.ticket || orderId || `ORD-${Date.now()}`;
    const fileName = `Order-${orderNumber}-${supplier.toUpperCase()}.pdf`;
    
    console.log('=== PDF GENERATION AND UPLOAD START ===');
    console.log('Order details:', {
      orderNumber,
      fileName,
      supplier,
      orderId: orderId || unifiedOrder.orderId,
      dealId,
      hasItems: !!unifiedOrder.fullOrderItems && unifiedOrder.fullOrderItems.length > 0,
      itemsCount: unifiedOrder.fullOrderItems?.length || 0,
      hasDelivery: !!unifiedOrder.delivery,
      orderSuccess: orderResult?.success,
      confirmationNumber: orderResult?.confirmationNumber || 'N/A'
    });
    
    // Transform: Generate PDF
    console.log('Generating order PDF...');
    const pdfBuffer = await generateOrderPDF(unifiedOrder, orderResult || {});
    
    if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer)) {
      throw new Error(`PDF generation returned invalid buffer. Type: ${typeof pdfBuffer}, isBuffer: ${Buffer.isBuffer(pdfBuffer)}`);
    }
    
    console.log('✅ PDF generated successfully. Size:', pdfBuffer.length, 'bytes');
    
    // Store: Upload PDF to HubSpot Files API
    const finalOrderId = orderId || unifiedOrder.orderId || unifiedOrder.selectedOrderId || null;
    
    console.log('=== ATTEMPTING PDF UPLOAD TO HUBSPOT ===');
    console.log('Upload parameters:', {
      fileName,
      orderId: finalOrderId,
      dealId,
      pdfSize: pdfBuffer.length
    });
    
    const uploadResult = await uploadPDFToHubspot(
      pdfBuffer,
      fileName,
      finalOrderId,
      dealId
    );
    
    console.log('=== PDF UPLOAD RESULT ===');
    console.log('Full upload result:', JSON.stringify(uploadResult, null, 2));
    
    if (uploadResult && (uploadResult.url || uploadResult.appUrl)) {
      // Prefer appUrl (HubSpot app format) over CDN URL for order_pdf property
      const pdfUrl = uploadResult.appUrl || uploadResult.url;
      
      console.log('✅ PDF uploaded successfully to HubSpot');
      console.log('📎 App URL (for order_pdf):', pdfUrl);
      console.log('📎 CDN URL (reference):', uploadResult.url);
      
      return {
        statusCode: 200,
        body: {
          success: true,
          pdfUrl: pdfUrl,
          pdfFileId: uploadResult.fileId,
          pdfCdnUrl: uploadResult.url,
          pdfFileName: fileName,
          pdfSize: pdfBuffer.length,
          message: 'PDF generated and uploaded successfully'
        }
      };
    } else {
      // Fall back to data URL if upload didn't return URL
      console.error('❌ PDF upload did not return a URL');
      console.error('Upload result structure:', uploadResult);
      const base64PDF = pdfBuffer.toString('base64');
      
      return {
        statusCode: 200,
        body: {
          success: true,
          pdfUrl: `data:application/pdf;base64,${base64PDF}`,
          pdfUploadFailed: true,
          pdfUploadError: 'Upload succeeded but no URL returned',
          pdfFileName: fileName,
          pdfSize: pdfBuffer.length,
          message: 'PDF generated but upload did not return URL - using data URL fallback'
        }
      };
    }
    
  } catch (error) {
    console.error('=== PDF GENERATION/UPLOAD FAILED ===');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    return {
      statusCode: 500,
      body: {
        success: false,
        error: error.message || 'Unknown error occurred during PDF generation/upload',
        errorStack: error.stack
      }
    };
  }
};

