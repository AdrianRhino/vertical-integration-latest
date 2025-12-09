const axios = require("axios"); // Added axios for V4 associations

exports.main = async (context = {}) => {
    const { status, orderId, pdfUrl } = context.parameters || {};
    
    // Property name for storing PDF URL in HubSpot order object
    const pdfPropertyName = 'order_PDF';

    if (!status) {
        return {
            statusCode: 400,
            body: { error: "status is required" },
        };
    }

    if (!orderId) {
        return {
            statusCode: 400,
            body: { error: "orderId is required" },
        };
    }

    const token = process.env.HUBSPOT_API_KEY;

    console.log("=== setSubmitStatus CALLED ===");
    console.log("Order ID: ", orderId);
    console.log("Status: ", status);
    console.log("PDF URL: ", pdfUrl || "(not provided)");
    
    try {
        const properties = {
            status: status,
        };
        
        // Add PDF URL if provided - ensure it's a valid HTTP/HTTPS URL
        if (pdfUrl) {
            // Validate and normalize URL for HubSpot URL property type
            let validUrl = pdfUrl.trim();
            
            // HubSpot URL properties require http:// or https://
            if (!validUrl.startsWith('http://') && !validUrl.startsWith('https://')) {
                // If it starts with //, prepend https:
                if (validUrl.startsWith('//')) {
                    validUrl = `https:${validUrl}`;
                } else {
                    // Otherwise prepend https://
                    validUrl = `https://${validUrl}`;
                }
                console.log("Normalized PDF URL for HubSpot:", { original: pdfUrl, normalized: validUrl });
            }
            
            // For text properties, we can save data URLs too
            // For URL properties, only HTTP/HTTPS URLs are valid
            // Try to validate, but if it's a data URL and property is text, allow it
            if (validUrl.startsWith('data:')) {
                // Data URL - save directly (works for text properties)
                properties[pdfPropertyName] = validUrl;
                console.log(`✅ Adding ${pdfPropertyName} property with data URL (text property allows this)`);
            } else {
                // HTTP/HTTPS URL - validate it
                try {
                    new URL(validUrl); // This will throw if URL is invalid
                    properties[pdfPropertyName] = validUrl;
                    console.log(`✅ Adding ${pdfPropertyName} property with valid HTTP/HTTPS URL:`, validUrl);
                } catch (urlError) {
                    console.error(`❌ Invalid URL format, cannot save to ${pdfPropertyName}:`, validUrl);
                    console.error("URL validation error:", urlError.message);
                }
            }
        } else {
            console.log(`⚠️ No PDF URL provided, skipping ${pdfPropertyName} update`);
        }
        
        console.log("=== PROPERTIES TO UPDATE ===");
        console.log(JSON.stringify(properties, null, 2));
        console.log("=== API ENDPOINT ===");
        console.log(`PATCH https://api.hubapi.com/crm/v3/objects/2-22239999/${orderId}`);
        
        const response = await axios.patch(
            `https://api.hubapi.com/crm/v3/objects/2-22239999/${orderId}`,
            { 
                properties: properties,
            },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
            }
        );
        
        console.log("=== HUBSPOT API RESPONSE ===");
        console.log(JSON.stringify(response.data, null, 2));
        console.log("✅ Order status updated successfully");
        
        return {
            statusCode: 200,
            body: { 
                message: "Order status updated successfully", 
                data: response.data,
                propertiesUpdated: properties
            },
        };
    } catch (error) {
        console.error("Error updating order status:", error.message);
        console.error("Error details:", error.response?.data);
        return {
            statusCode: 500,
            body: { 
                error: "Failed to update order status",
                details: error.response?.data || error.message
            },
        };
    }
}