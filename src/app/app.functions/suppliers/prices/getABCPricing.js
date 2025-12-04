/**
 * Shape Language: Input → Filter → Transform → Store → Output → Loop
 * 
 * Input: Context with abcAccessToken, fullOrder, optional environment
 * Filter: Validates access token and fullOrder exist
 * Transform: Gets API base URL from credentials config, formats line items
 * Store: N/A
 * Output: Pricing data from ABC API
 * Loop: Self-healing - reads environment from order config if not provided
 */

const axios = require("axios");
const { getCredentials } = require("../config/getCredentials");

exports.main = async (context = {}) => {
    const { abcAccessToken, fullOrder, environment = null } = context.parameters || {};

    {/*
        Test Product
        {
            "id": "1",
            "itemNumber": "26VPJ118CY",
            "quantity": 1,
            "uom": "EA"
        }
        */}

    if (!abcAccessToken) {
        console.error("No ABC access token provided");
        return {
            success: false,
            message: "No ABC access token provided",
        };
    }

    if (!fullOrder) {
        console.error("No full order provided");
        return {
            success: false,
            message: "No full order provided",
        };
    }

    // Get API base URL from credentials config
    const credentials = getCredentials("ABC", environment);
    const apiBaseUrl = credentials.apiBaseUrl;

    const formattedLineItems = fullOrder.fullOrderItems.map(item => ({
        id: item.id,
        itemNumber: item.sku,
        quantity: item.qty,
        uom: item.uom,
    }));

    console.log("Formatted Line Items:", formattedLineItems);
    console.log(`Using ABC API (${credentials.environment}): ${apiBaseUrl}`);

    const config = {
        method: "post",
        url: `${apiBaseUrl}/api/pricing/v2/prices`,
        headers: {
            Authorization: `Bearer ${abcAccessToken}`,
            "Content-Type": "application/json",
            Accept: "application/json",
        },
        data: {
            branchNumber: "461",
            shipToNumber: "2063975-2",
            requestId: "Test-Quote-123",
            purpose: "estimating",
            lines: formattedLineItems,
        },
    };  
    try {
        const response = await axios(config);
        console.log("ABC Pricing Response:", response.data);
        return {
            success: true,
            message: `ABC Pricing fetched successfully (${credentials.environment})`,
            data: response.data,
            environment: credentials.environment,
        };
    } catch (error) {
        console.error("Error in ABC Pricing:", error);
        return {
            success: false,
            message: "ABC Pricing fetch failed",
            error: error.message,
        };
    }

}