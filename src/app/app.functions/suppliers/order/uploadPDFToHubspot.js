/**
 * Shape Language: Input → Filter → Transform → Store → Output → Loop
 * 
 * Input: PDF buffer, filename, optional orderId and dealId
 * Filter: Validates PDF buffer and API key exist
 * Transform: Formats multipart/form-data request with file buffer (per HubSpot API spec)
 * Store: Uploads to HubSpot Files API using multipart/form-data via axios
 * Output: File URL and file ID
 * Loop: Self-healing - returns error info if upload fails
 * 
 * Required HubSpot API Scopes:
 * - files.ui_hidden.read_write (Files API access)
 * - crm.objects.custom.read (if associating with custom objects)
 * 
 * API Reference: https://developers.hubspot.com/docs/api-reference/files-files-v3/files/post-files-v3-files
 * 
 * Note: HubSpot Files API v3 requires multipart/form-data, not JSON with base64.
 * This implementation uses axios with form-data library (simpler than native https).
 */

const axios = require('axios');
const FormData = require('form-data');

/**
 * Upload PDF to HubSpot Files API
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @param {string} fileName - Name for the file
 * @param {string} orderId - Optional order ID for association
 * @param {string} dealId - Optional deal ID for association
 * @param {string} folderPath - Optional folder path (e.g., '/orders'). Defaults to '/orders'. Either folderPath or folderId must be provided.
 * @param {string} folderId - Optional folder ID. If provided, takes precedence over folderPath.
 * @returns {Promise<Object>} Object with url and fileId
 */
async function uploadPDFToHubspot(pdfBuffer, fileName, orderId = null, dealId = null, folderPath = '/orders', folderId = null) {
  try {
    const apiKey = process.env.HUBSPOT_API_KEY;
    
    if (!apiKey) {
      console.error('❌ HUBSPOT_API_KEY check:', {
        hasKey: !!apiKey,
        keyLength: apiKey ? apiKey.length : 0,
        envKeys: Object.keys(process.env).filter(k => k.includes('HUBSPOT'))
      });
      throw new Error('HUBSPOT_API_KEY environment variable is not set. Make sure it is added to secrets in serverless.json and has Files API permissions (files.ui_hidden.read_write scope)');
    }
    
    // Log API key validation (without exposing the key)
    console.log('✅ API key validated:', {
      hasKey: !!apiKey,
      keyLength: apiKey.length,
      keyPrefix: apiKey.substring(0, 8) + '...'
    });
    
    console.log('Uploading PDF to HubSpot:', {
      fileName,
      bufferSize: pdfBuffer.length,
      hasOrderId: !!orderId,
      hasDealId: !!dealId
    });
    
    if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer)) {
      throw new Error('Invalid PDF buffer provided');
    }
    
    // Create multipart/form-data payload per HubSpot Files API v3 specification
    // Reference: https://developers.hubspot.com/docs/api-reference/files-files-v3/files/post-files-v3-files
    // Based on working example that uses axios
    const form = new FormData();
    
    // Add file buffer as 'file' field (using Buffer.from to ensure it's a Buffer)
    form.append('file', Buffer.from(pdfBuffer), {
      filename: fileName,
      contentType: 'application/pdf'
    });
    
    // Add charsetHunch (optional but included in working example)
    form.append('charsetHunch', 'UTF-8');
    
    // Add folderId or folderPath (required by HubSpot API - either folderId or folderPath must be provided)
    // folderId takes precedence if both are provided
    if (folderId) {
      form.append('folderId', folderId);
      console.log('✅ Added folderId to form:', folderId);
    } else {
      // Use provided folderPath or default to '/orders'
      const finalFolderPath = folderPath || '/orders';
      form.append('folderPath', finalFolderPath);
      console.log('✅ Added folderPath to form:', finalFolderPath);
    }
    
    // Add fileName field
    form.append('fileName', fileName);
    
    // Add options as JSON string (access level and other settings)
    const optionsJson = JSON.stringify({
      access: 'PUBLIC_NOT_INDEXABLE'
    });
    form.append('options', optionsJson);
    
    // Verify all required fields are added
    console.log('✅ All form fields added:', {
      folderId: folderId || null,
      folderPath: folderId ? null : (folderPath || '/orders'),
      fileName: fileName,
      hasFile: true,
      hasOptions: true,
      hasCharsetHunch: true
    });
    
    console.log('Multipart form data prepared:', {
      fileName,
      fileSize: pdfBuffer.length,
      folderId: folderId || null,
      folderPath: folderId ? null : (folderPath || '/orders'),
      access: 'PUBLIC_NOT_INDEXABLE',
      contentType: 'application/pdf'
    });
    
    // Upload the file to HubSpot Files API using axios (simpler than native https)
    console.log('Sending request to HubSpot Files API...');
    const uploadResponse = await axios.post('https://api.hubapi.com/files/v3/files', form, {
      headers: {
        ...form.getHeaders(), // Get headers from FormData (includes Content-Type with boundary)
        'Authorization': `Bearer ${apiKey}`,
      },
      maxBodyLength: Infinity, // Allow large file uploads
      maxContentLength: Infinity
    });
    
    console.log('=== HUBSPOT FILES API RESPONSE ===');
    console.log('Status Code:', uploadResponse.status);
    console.log('Response keys:', Object.keys(uploadResponse.data));
    console.log('Full response:', JSON.stringify(uploadResponse.data, null, 2));
    
    // Extract file URL and ID from response
    const fileUrl = uploadResponse.data.url;
    const fileId = uploadResponse.data.id;
    const responseFolderId = uploadResponse.data.folderId || uploadResponse.data.folder?.id;
    
    console.log('Extracted fileUrl:', fileUrl);
    console.log('Extracted fileId:', fileId);
    console.log('Extracted folderId from response:', responseFolderId);
    
    if (!fileUrl) {
      console.error('❌ No file URL in response');
      console.error('Response structure:', JSON.stringify(uploadResponse.data, null, 2));
      throw new Error(`HubSpot API returned success but no file URL. Response: ${JSON.stringify(uploadResponse.data)}`);
    }
    
    if (!fileId) {
      console.error('❌ No file ID in response');
      console.error('Response structure:', JSON.stringify(uploadResponse.data, null, 2));
      throw new Error(`HubSpot API returned success but no file ID. Response: ${JSON.stringify(uploadResponse.data)}`);
    }
    
    // Associate with order if orderId provided (non-blocking)
    if (orderId && fileId) {
      associateFileWithOrder(fileId, orderId).catch(err => {
        console.warn('Failed to associate file with order:', err.message);
      });
    }
    
    // Associate with deal if dealId provided (non-blocking)
    if (dealId && fileId) {
      associateFileWithDeal(fileId, dealId).catch(err => {
        console.warn('Failed to associate file with deal:', err.message);
      });
    }
    
    // Ensure URL is a valid HTTP/HTTPS URL
    let validUrl = fileUrl;
    if (fileUrl && !fileUrl.startsWith('http://') && !fileUrl.startsWith('https://')) {
      validUrl = fileUrl.startsWith('//') ? `https:${fileUrl}` : `https://${fileUrl}`;
      console.log('Normalized PDF URL:', { original: fileUrl, normalized: validUrl });
    }
    
    console.log('✅ PDF upload successful, returning URL:', validUrl);
    
    // Construct HubSpot app URL format: https://app.hubspot.com/files/{portalId}/?folderId={folderId}&showDetails={fileId}
    // Portal ID can be set in environment variable or extracted from API key format
    // Default to 21196760 (from hubspot.config.yml) if not set
    const portalId = process.env.HUBSPOT_PORTAL_ID || '21196760';
    
    // Use folderId from response (preferred), then from function parameter, then fallback
    const finalFolderId = responseFolderId || folderId || '202125547541';
    
    // Construct the HubSpot app URL format for the order_pdf property
    const appUrl = `https://app.hubspot.com/files/${portalId}/?folderId=${finalFolderId}&showDetails=${fileId}`;
    
    console.log('📎 Constructed HubSpot app URL for order_pdf:', appUrl);
    console.log('📎 File details:', { 
      portalId, 
      folderId: finalFolderId, 
      fileId,
      folderIdSource: responseFolderId ? 'response' : folderId ? 'parameter' : 'fallback'
    });
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/b131dc2d-5624-4f61-98fb-efc543f7726a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'uploadPDFToHubspot.js:188',message:'APP_URL_CONSTRUCTION',data:{appUrl,portalId,folderId:finalFolderId,fileId,hasValidUrl:!!validUrl,hasFileId:!!fileId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
    
    const returnValue = {
      url: validUrl, // Keep original CDN URL for reference
      appUrl: appUrl, // HubSpot app URL format for order_pdf property
      fileId: fileId,
      folderId: finalFolderId,
      portalId: portalId,
      success: true
    };
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/b131dc2d-5624-4f61-98fb-efc543f7726a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'uploadPDFToHubspot.js:205',message:'RETURN_VALUE',data:{hasUrl:!!returnValue.url,hasAppUrl:!!returnValue.appUrl,appUrl:returnValue.appUrl,url:returnValue.url?.substring(0,100)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
    
    return returnValue;
    
  } catch (error) {
    // Handle axios errors
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      const statusCode = error.response.status;
      const errorMsg = error.response.data?.message || error.response.data?.error || error.response.data?.errors?.[0]?.message || `HTTP ${statusCode}`;
      
      console.error('❌ HubSpot API error response:', {
        statusCode: statusCode,
        error: errorMsg,
        fullResponse: error.response.data,
        headers: error.response.headers
      });
      
      // Provide more helpful error messages based on status code
      let helpfulMessage = errorMsg;
      if (statusCode === 401) {
        helpfulMessage = 'Unauthorized - Check API key and ensure it has Files API permissions (files.ui_hidden.read_write scope)';
      } else if (statusCode === 403) {
        helpfulMessage = 'Forbidden - API key lacks required permissions for Files API';
      } else if (statusCode === 413) {
        helpfulMessage = 'Payload too large - File size exceeds HubSpot limit';
      } else if (statusCode === 400) {
        helpfulMessage = `Bad Request - ${errorMsg}. Check payload format matches HubSpot Files API specification.`;
      }
      
      throw new Error(`HubSpot API error (${statusCode}): ${helpfulMessage}`);
    } else if (error.request) {
      // The request was made but no response was received
      console.error('❌ No response received from HubSpot API:', {
        message: error.message,
        code: error.code
      });
      throw new Error(`Request failed: ${error.message}. No response received from HubSpot API.`);
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error('❌ Error setting up request:', {
        message: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
}

/**
 * Associate file with order (if order custom object exists)
 */
async function associateFileWithOrder(fileId, orderId) {
  // This would require the order object type ID
  // For now, we'll log it - can be implemented later if needed
  console.log(`File ${fileId} should be associated with order ${orderId}`);
}

/**
 * Associate file with deal using HubSpot V4 Associations API
 * Uses axios (not native https module) for consistency
 */
async function associateFileWithDeal(fileId, dealId) {
  // Verify axios is available (should always be, but double-check)
  if (typeof axios === 'undefined' || !axios.put) {
    const errorMsg = 'axios is not available. This should not happen.';
    console.error('❌', errorMsg);
    throw new Error(errorMsg);
  }
  
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/b131dc2d-5624-4f61-98fb-efc543f7726a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'uploadPDFToHubspot.js:275',message:'ASSOCIATE_FILE_DEAL_START',data:{fileId,dealId,hasAxios:typeof axios!=='undefined',axiosType:typeof axios},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
  // #endregion
  
  const apiKey = process.env.HUBSPOT_API_KEY;
  
  if (!apiKey) {
    throw new Error('HUBSPOT_API_KEY is required for file association');
  }
  
  try {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/b131dc2d-5624-4f61-98fb-efc543f7726a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'uploadPDFToHubspot.js:283',message:'BEFORE_AXIOS_PUT',data:{fileId,dealId,url:`/crm/v4/objects/files/${fileId}/associations/deals/${dealId}`,hasAxios:typeof axios!=='undefined'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
    
    const response = await axios.put(
      `https://api.hubapi.com/crm/v4/objects/files/${fileId}/associations/deals/${dealId}`,
      {
        associationCategory: 'HUBSPOT_DEFINED',
        associationTypeId: 3 // File to Deal association
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/b131dc2d-5624-4f61-98fb-efc543f7726a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'uploadPDFToHubspot.js:302',message:'ASSOCIATION_SUCCESS',data:{fileId,dealId,statusCode:response.status},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
    
    console.log(`✅ File ${fileId} successfully associated with deal ${dealId}`);
    return response.data;
  } catch (error) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/b131dc2d-5624-4f61-98fb-efc543f7726a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'uploadPDFToHubspot.js:310',message:'ASSOCIATION_ERROR',data:{fileId,dealId,error:error.message,statusCode:error.response?.status,errorType:error.constructor.name},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
    
    // Provide more helpful error message
    const errorMessage = error.message || 'Unknown error';
    if (errorMessage.includes('https is not defined')) {
      console.error('❌ CRITICAL: Old code version detected! The error "https is not defined" means the serverless functions are running cached/old code.');
      console.error('❌ ACTION REQUIRED: Restart/redeploy your HubSpot serverless functions to load the updated code.');
      throw new Error('Serverless functions need to be restarted. Old code version detected (https module reference). Please redeploy.');
    }
    
    throw error;
  }
}

module.exports = {
  uploadPDFToHubspot
};

