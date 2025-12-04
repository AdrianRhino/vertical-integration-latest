/**
 * Shape Language: Input → Filter → Transform → Store → Output → Loop
 * 
 * Input: Context with token, fullOrder, optional environment
 * Filter: Validates token and fullOrder exist
 * Transform: Gets API base URL from credentials config, formats line items
 * Store: N/A
 * Output: Pricing data from SRS API
 * Loop: Self-healing - reads environment from order config if not provided
 */

const axios = require("axios");
const { getCredentials } = require("../config/getCredentials");

exports.main = async (context = {}) => {
    const { token, fullOrder, environment = null } = context.parameters || {};

    {/*
        Test Product
        {
            "productId": 186233,
            "productName": "AFCO Vinyl Stair Bracket Kit",
            "quantity": 1,
            "uom": "KIT"
        }
        */}

    if (!token) {
        console.error("No access token provided");
        return {
            success: false,
            message: "No access token provided",
        };
    }
    
    if (!fullOrder) {
        console.error("No full order provided");
        return {
            success: false,
            message: "No full order provided",
        };
    }

    console.log("Full Order:", fullOrder);
    console.log("Token:", token);
    
    const orderItems = Array.isArray(fullOrder.fullOrderItems) ? fullOrder.fullOrderItems : [];

    const productList = orderItems
        .map(item => {
            const productIdentifier = item.productId ?? item.id ?? item.itemId;
            const parsedProductId = Number(productIdentifier);
            const hasNumericProductId = Number.isFinite(parsedProductId);

            const sku = item.sku || item.itemCode || item.productSku;
            if (!hasNumericProductId && !sku) {
                console.warn("Skipping line item without product identifier:", item);
                return null;
            }

            const rawOptions =
                Array.isArray(item.productOptions) && item.productOptions.length > 0
                    ? item.productOptions
                    : item.productOptions
                        ? [item.productOptions]
                        : item.variant
                            ? [item.variant]
                            : ["N/A"];

            const normalizedOptions = rawOptions
                .filter(option => option !== undefined && option !== null && `${option}`.trim() !== "")
                .map(option => `${option}`.trim());

            const payloadItem = {
                productId: hasNumericProductId ? parsedProductId : undefined,
                productName: item.title || item.productName || item.name || "",
                productOptions: normalizedOptions.length > 0 ? normalizedOptions : ["N/A"],
                quantity: Number(item.qty ?? item.quantity ?? 1) || 1,
                uom: item.uom || item.unitOfMeasure || item.unitOfMeasurement || "PC",
            };

            if (sku) {
                payloadItem.itemCode = `${sku}`.trim();
            }

            Object.keys(payloadItem).forEach(key => {
                if (payloadItem[key] === undefined) {
                    delete payloadItem[key];
                }
            });

            return payloadItem;
        })
        .filter(Boolean);

    if (productList.length === 0) {
        console.error("No valid product data found on full order items");
        return {
            success: false,
            message: "No valid product data found on full order items",
        };
    }

    const payload = {
        sourceSystem: fullOrder.sourceSystem || "RHINO",
        customerCode: fullOrder.customerCode || fullOrder.accountId || "RCO207",
        branchCode: fullOrder.branchCode || "SSSAN",
        transactionId: fullOrder.transactionId || "SPR-1",
        jobAccountNumber: Number(fullOrder.jobAccountNumber || fullOrder.jobNumber || 1) || 1,
        productList,
    };

    // Get API base URL from credentials config
    const credentials = getCredentials("SRS", environment);
    const apiBaseUrl = credentials.apiBaseUrl;

    const config = {
        method: "POST",
        url: `${apiBaseUrl}/products/v2/price`,
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
        },
        data: payload,
    };

    console.log("SRS Pricing Request URL:", config.url);
    console.log("Request headers:", config.headers);
    console.log("Request payload:", payload);

    try {
        console.log("Making request to:", config.url);
        console.log("Request headers:", config.headers);
        console.log("Request data:", config.data);
        
        const response = await axios(config);
        console.log("SRS Pricing Response Status:", response.status);
        console.log("SRS Pricing Response Data:", response.data);
        
        return {
            success: true,
            message: `SRS Pricing fetched successfully (${credentials.environment})`,
            data: response.data,
            environment: credentials.environment,
        };
    }
    catch (error) {
        console.error("Error in SRS Pricing:");
        console.error("Error message:", error.message);
        console.error("Error response:", error.response?.data);
        console.error("Error status:", error.response?.status);
        
        return {
            success: false,
            status: error.response?.status,
            message: "SRS Pricing fetch failed",
            error: error.response?.data || error.message,
        };
    }
}