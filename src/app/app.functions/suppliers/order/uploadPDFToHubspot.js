/**
 * Shape Language: Input → Filter → Transform → Store → Output → Loop
 * 
 * Input: PDF buffer, filename, optional orderId and dealId
 * Filter: Validates PDF buffer and API key exist
 * Transform: Converts buffer to base64, formats upload request
 * Store: Uploads to HubSpot Files API
 * Output: File URL and file ID
 * Loop: Self-healing - returns error info if upload fails
 */

const https = require('https');

/**
 * Upload PDF to HubSpot Files API
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @param {string} fileName - Name for the file
 * @param {string} orderId - Optional order ID for association
 * @param {string} dealId - Optional deal ID for association
 * @returns {Promise<Object>} Object with url and fileId
 */
async function uploadPDFToHubspot(pdfBuffer, fileName, orderId = null, dealId = null) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.HUBSPOT_API_KEY;
    
    if (!apiKey) {
      console.error('HUBSPOT_API_KEY check:', {
        hasKey: !!apiKey,
        keyLength: apiKey ? apiKey.length : 0,
        envKeys: Object.keys(process.env).filter(k => k.includes('HUBSPOT'))
      });
      reject(new Error('HUBSPOT_API_KEY environment variable is not set. Make sure it is added to secrets in serverless.json'));
      return;
    }
    
    console.log('Uploading PDF to HubSpot:', {
      fileName,
      bufferSize: pdfBuffer.length,
      hasOrderId: !!orderId,
      hasDealId: !!dealId
    });
    
    if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer)) {
      reject(new Error('Invalid PDF buffer provided'));
      return;
    }
    
    // Convert buffer to base64
    const base64Content = pdfBuffer.toString('base64');
    
    const payload = JSON.stringify({
      name: fileName,
      access: 'PUBLIC_NOT_INDEXABLE',
      base64Encoding: base64Content,
      encoding: 'base64',
      fileName: fileName,
      mimeType: 'application/pdf',
    });
    
    const options = {
      hostname: 'api.hubapi.com',
      path: '/files/v3/files',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        // Log response for debugging
        console.log('HubSpot Files API Response:', {
          statusCode: res.statusCode,
          headers: res.headers,
          dataPreview: data.substring(0, 200),
          isHTML: data.trim().startsWith('<')
        });
        
        // Check if response is HTML (error page)
        if (data.trim().startsWith('<')) {
          const errorPreview = data.substring(0, 500);
          console.error('HubSpot returned HTML instead of JSON:', errorPreview);
          reject(new Error(`HubSpot API returned HTML error page. Status: ${res.statusCode}. Check API key permissions and endpoint. Response preview: ${errorPreview.substring(0, 200)}`));
          return;
        }
        
        try {
          const result = JSON.parse(data);
          
          console.log('=== HUBSPOT FILES API PARSED RESPONSE ===');
          console.log('Status Code:', res.statusCode);
          console.log('Response keys:', Object.keys(result));
          console.log('Full response:', JSON.stringify(result, null, 2));
          
          if (res.statusCode >= 200 && res.statusCode < 300) {
            const fileUrl = result.url || result.objects?.[0]?.url || result.data?.url;
            const fileId = result.id || result.objects?.[0]?.id || result.data?.id;
            
            console.log('Extracted fileUrl:', fileUrl);
            console.log('Extracted fileId:', fileId);
            
            if (!fileUrl && !fileId) {
              console.error('❌ Unexpected response structure - no URL or ID found');
              console.error('Response structure:', JSON.stringify(result, null, 2));
              reject(new Error(`HubSpot API returned success but no file URL or ID. Response: ${JSON.stringify(result)}`));
              return;
            }
            
            if (!fileUrl) {
              console.error('❌ No file URL in response, only fileId:', fileId);
              reject(new Error(`HubSpot API returned file ID but no URL. File ID: ${fileId}`));
              return;
            }
            
            // Associate with order if orderId provided
            if (orderId && fileId) {
              associateFileWithOrder(fileId, orderId).catch(err => {
                console.warn('Failed to associate file with order:', err.message);
              });
            }
            
            // Associate with deal if dealId provided
            if (dealId && fileId) {
              associateFileWithDeal(fileId, dealId).catch(err => {
                console.warn('Failed to associate file with deal:', err.message);
              });
            }
            
            // Ensure URL is a valid HTTP/HTTPS URL
            let validUrl = fileUrl;
            if (fileUrl && !fileUrl.startsWith('http://') && !fileUrl.startsWith('https://')) {
              // HubSpot Files API URLs should already be https://, but ensure it's valid
              validUrl = fileUrl.startsWith('//') ? `https:${fileUrl}` : `https://${fileUrl}`;
              console.log('Normalized PDF URL:', { original: fileUrl, normalized: validUrl });
            }
            
            console.log('✅ PDF upload successful, returning URL:', validUrl);
            resolve({
              url: validUrl,
              fileId: fileId,
              success: true
            });
          } else {
            const errorMsg = result.message || result.error || result.errors?.[0]?.message || `HTTP ${res.statusCode}`;
            console.error('❌ HubSpot API error response:', {
              statusCode: res.statusCode,
              error: errorMsg,
              fullResponse: result
            });
            reject(new Error(`HubSpot API error (${res.statusCode}): ${errorMsg}`));
          }
        } catch (parseError) {
          console.error('Failed to parse response:', {
            error: parseError.message,
            statusCode: res.statusCode,
            responsePreview: data.substring(0, 500)
          });
          reject(new Error(`Failed to parse HubSpot response: ${parseError.message}. Response was: ${data.substring(0, 200)}`));
        }
      });
    });
    
    req.on('error', (err) => {
      reject(new Error(`Request failed: ${err.message}`));
    });
    
    req.write(payload);
    req.end();
  });
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
 * Associate file with deal
 */
async function associateFileWithDeal(fileId, dealId) {
  const apiKey = process.env.HUBSPOT_API_KEY;
  
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.hubapi.com',
      path: `/crm/v4/objects/files/${fileId}/associations/deals/${dealId}`,
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`Association failed: ${res.statusCode}`));
        }
      });
    });
    
    req.on('error', reject);
    req.write(JSON.stringify({
      associationCategory: 'HUBSPOT_DEFINED',
      associationTypeId: 3 // File to Deal association
    }));
    req.end();
  });
}

module.exports = {
  uploadPDFToHubspot
};

