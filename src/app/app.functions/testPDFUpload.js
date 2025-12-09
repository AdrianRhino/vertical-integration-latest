/**
 * Shape Language: Input → Filter → Transform → Store → Output → Loop
 * 
 * Input: orderId (optional), dealId (optional)
 * Filter: Validates required modules exist
 * Transform: Generates simple test PDF
 * Store: Uploads to HubSpot Files API
 * Output: Upload result with URL or error
 * Loop: Self-healing - returns detailed error info
 * 
 * Test function to verify PDF generation and HubSpot Files API upload
 */

// Try to load PDF generation and upload modules
let generateOrderPDF, uploadPDFToHubspot;
try {
  const pdfModule = require('./suppliers/order/generateOrderPDF');
  const uploadModule = require('./suppliers/order/uploadPDFToHubspot');
  generateOrderPDF = pdfModule.generateOrderPDF;
  uploadPDFToHubspot = uploadModule.uploadPDFToHubspot;
} catch (error) {
  console.warn('PDF modules not available:', error.message);
  generateOrderPDF = null;
  uploadPDFToHubspot = null;
}

exports.main = async (context = {}) => {
  try {
    const { orderId, dealId } = context.parameters || {};
    
    console.log('=== TEST PDF UPLOAD START ===');
    console.log('Parameters:', { orderId, dealId });
    
    // Check if modules are available
    if (!generateOrderPDF) {
      return {
        statusCode: 500,
        body: {
          success: false,
          error: 'PDF generation module not available',
          message: 'generateOrderPDF function not found. Check that generateOrderPDF.js exists.'
        }
      };
    }
    
    if (!uploadPDFToHubspot) {
      return {
        statusCode: 500,
        body: {
          success: false,
          error: 'PDF upload module not available',
          message: 'uploadPDFToHubspot function not found. Check that uploadPDFToHubspot.js exists.'
        }
      };
    }
    
    // Create a simple test order object
    const testOrder = {
      orderId: orderId || `TEST-${Date.now()}`,
      supplier: 'TEST',
      fullOrderItems: [
        {
          qty: 1,
          uom: 'EA',
          sku: 'TEST-SKU',
          title: 'Test Item',
          variant: 'Test Variant',
          unitPrice: 10.00
        }
      ],
      delivery: {
        address_line_1: '123 Test St',
        city: 'Test City',
        state: 'TS',
        zip_code: '12345'
      }
    };
    
    const testResult = {
      confirmationNumber: 'TEST-CONF-123',
      success: true
    };
    
    console.log('Generating test PDF...');
    const pdfBuffer = await generateOrderPDF(testOrder, testResult);
    console.log('PDF generated:', {
      size: pdfBuffer.length,
      sizeKB: (pdfBuffer.length / 1024).toFixed(2)
    });
    
    const fileName = `Test-PDF-${Date.now()}.pdf`;
    console.log('Uploading PDF to HubSpot...');
    console.log('Upload parameters:', {
      fileName,
      orderId: orderId || null,
      dealId: dealId || null,
      pdfSize: pdfBuffer.length
    });
    
    const uploadResult = await uploadPDFToHubspot(
      pdfBuffer,
      fileName,
      orderId || null,
      dealId || null
    );
    
    console.log('=== TEST PDF UPLOAD RESULT ===');
    console.log('Upload result:', JSON.stringify(uploadResult, null, 2));
    
    if (uploadResult && uploadResult.url) {
      console.log('✅ SUCCESS: PDF uploaded to HubSpot');
      console.log('File URL:', uploadResult.url);
      console.log('File ID:', uploadResult.fileId);
      
      return {
        statusCode: 200,
        body: {
          success: true,
          message: 'PDF generated and uploaded successfully',
          pdfUrl: uploadResult.url,
          fileId: uploadResult.fileId,
          fileName: fileName,
          pdfSize: pdfBuffer.length,
          pdfSizeKB: (pdfBuffer.length / 1024).toFixed(2)
        }
      };
    } else {
      console.error('❌ FAILED: Upload did not return URL');
      console.error('Upload result:', uploadResult);
      
      return {
        statusCode: 500,
        body: {
          success: false,
          error: 'Upload succeeded but no URL returned',
          uploadResult: uploadResult,
          message: 'PDF was generated but upload did not return a URL. Check serverless logs for details.'
        }
      };
    }
    
  } catch (error) {
    console.error('❌ TEST PDF UPLOAD ERROR');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    
    return {
      statusCode: 500,
      body: {
        success: false,
        error: error.message,
        errorType: error.constructor.name,
        message: 'PDF generation or upload failed. Check serverless logs for details.',
        stack: error.stack
      }
    };
  }
};

