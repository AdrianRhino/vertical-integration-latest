/**
 * Shape Language: Input → Filter → Transform → Store → Output → Loop
 * 
 * Input: Context (optional environment parameter)
 * Filter: Validates credentials exist
 * Transform: Gets credentials from config, creates auth token, formats order
 * Store: N/A
 * Output: Order submission response from ABC API
 * Loop: Self-healing - reads environment from order config if not provided
 */

const axios = require("axios");
const { getCredentials } = require("../config/getCredentials");
const { normalizeInput } = require("./normalizeInput");
const { formatOrder } = require("./formatOrder");

/**
 * Build hardcoded test payload for sandbox testing
 * Maintains exact structure required by ABC API
 */
function buildHardcodedTestPayload(productData, accountData) {
  const { itemNumber, itemUom } = productData;
  const { shipToNumber, branchNumber, validShipTos, formattedDate } = accountData;

  return [
    {
      requestId: `sandbox-test-${Date.now()}`, // Unique request ID
      purchaseOrder: `TEST-PO-${Date.now()}`, // Unique PO
      branchNumber: branchNumber, // Use branch from account search
      deliveryService: "OTG",
      typeCode: "SO",
      dates: { 
        deliveryRequestedFor: formattedDate // Use calculated date instead of hardcoded
      },
      deliveryAppointment: {
        instructionsTypeCode: "AT",
        instructions: "Sandbox test order - DO NOT FULFILL",
        fromTime: "10:00",
        toTime: "11:00",
        timeZoneCode: "CT",
      },
      currency: "USD",
      shipTo: {
        name: validShipTos.length > 0 ? validShipTos[0].name : "Sandbox Test",
        number: shipToNumber, // Use ship-to from account search
        address: {
          line1: "123 Main St",
          line2: "",
          line3: "",
          city: "Chicago",
          state: "IL",
          postal: "60661",
          country: "USA",
        },
        contacts: [],
      },
      orderComments: [],
      lines: [
        {
          id: "1",
          itemNumber: itemNumber, // Use item from product response
          orderedQty: { 
            value: 1, 
            uom: itemUom // Use UOM from product response
          },
          // For sandbox, unitPrice might need to be 0 or omitted
          // Try with 0 first, ABC will price it
          unitPrice: { 
            value: 0.0, // Changed to 0 - ABC should price it
            uom: itemUom, 
            instructions: "Sandbox test - call for pricing" 
          },
        },
      ],
    },
  ];
}

/**
 * Calculate delivery date (7 days from now, formatted as YYYY-MM-DD)
 */
function calculateDeliveryDate() {
  const deliveryDate = new Date();
  deliveryDate.setDate(deliveryDate.getDate() + 7);
  return deliveryDate.toISOString().split('T')[0];
}

/**
 * Build payload dynamically based on environment and parameters
 * Maintains EXACT same structure as hardcoded version
 */
function buildPayload(context, credentials, productData, accountData) {
  const { orderBody, useTestPayload } = context.parameters || {};
  const isSandbox = credentials.environment === "sandbox";
  
  // Sandbox: Default to hardcoded test unless useTestPayload is explicitly false
  // Production: Always use orderBody
  if (isSandbox && useTestPayload !== false) {
    return buildHardcodedTestPayload(productData, accountData);
  }
  
  // Production or sandbox with useTestPayload=false → use orderBody
  if (!orderBody) {
    const errorMsg = isSandbox 
      ? "orderBody is required when useTestPayload is false in sandbox"
      : "orderBody is required for production orders";
    throw new Error(errorMsg);
  }
  
  // Normalize and format
  const normalized = normalizeInput(orderBody);
  if (!normalized) {
    throw new Error("Failed to normalize order input");
  }
  
  const formatted = formatOrder(normalized, "ABC", credentials.environment);
  
  // Extract from array (formatOrder returns array for ABC)
  const formattedOrder = Array.isArray(formatted) ? formatted[0] : formatted;
  
  // Extract account data for fallbacks
  const { shipToNumber, branchNumber, validShipTos, formattedDate } = accountData;
  
  // Build payload with EXACT same structure as hardcoded version
  return [{
    requestId: formattedOrder.requestId || `req-${Date.now()}`,
    purchaseOrder: formattedOrder.purchaseOrder || 'N/A',
    branchNumber: formattedOrder.branchNumber || branchNumber,
    deliveryService: formattedOrder.deliveryService || 'OTG',
    typeCode: formattedOrder.typeCode || 'SO',
    dates: {
      deliveryRequestedFor: formattedOrder.dates?.deliveryRequestedFor || formattedDate || calculateDeliveryDate()
    },
    deliveryAppointment: {
      instructionsTypeCode: formattedOrder.deliveryAppointment?.instructionsTypeCode || 'AT',
      instructions: formattedOrder.deliveryAppointment?.instructions || '',
      fromTime: formattedOrder.deliveryAppointment?.fromTime || '10:00',
      toTime: formattedOrder.deliveryAppointment?.toTime || '11:00',
      timeZoneCode: formattedOrder.deliveryAppointment?.timeZoneCode || 'CT',
    },
    currency: formattedOrder.currency || 'USD',
    shipTo: {
      name: formattedOrder.shipTo?.name || (validShipTos.length > 0 ? validShipTos[0].name : ''),
      number: formattedOrder.shipTo?.number || shipToNumber,
      address: {
        line1: formattedOrder.shipTo?.address?.line1 || '',
        line2: formattedOrder.shipTo?.address?.line2 || '',
        line3: formattedOrder.shipTo?.address?.line3 || '',
        city: formattedOrder.shipTo?.address?.city || '',
        state: formattedOrder.shipTo?.address?.state || '',
        postal: formattedOrder.shipTo?.address?.postal || '',
        country: formattedOrder.shipTo?.address?.country || 'USA',
      },
      contacts: formattedOrder.shipTo?.contacts || [],
    },
    orderComments: formattedOrder.orderComments || [],
    lines: formattedOrder.lines || [],
  }];
}

exports.main = async (context = {}) => {
  // Get environment from context or read from config
  const environment = context.parameters?.environment || null;
  const credentials = getCredentials("ABC", environment);

  if (!credentials.clientId || !credentials.clientSecret) {
    return {
      success: false,
      message: "ABC credentials missing",
      error: `ABC credentials not found for environment: ${credentials.environment}`,
    };
  }

  const abcBasic64AuthKey = Buffer.from(
    `${credentials.clientId}:${credentials.clientSecret}`
  ).toString("base64");

  const config = {
    method: "post",
    url: credentials.authUrl,
    headers: {
      Authorization: `Basic ${abcBasic64AuthKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  };

  try {
    const response = await axios(config);

    if (!response?.data?.access_token) {
      return {
        success: false,
        message: "Token fetch failed",
        error: "No access token in response",
        status: 401,
      };
    }

    const token = response.data.access_token;
    console.log("Token:", token ? "✓" : "✗");

    const productTestResponse = await axios({
      method: "get",
      url: `${credentials.apiBaseUrl}/api/product/v1/items?itemsPerPage=1&pageNumber=1&embed=branches`,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    });

    console.log("Product Test Response:", JSON.stringify(productTestResponse.data, null, 2));

    // Extract valid item number from product response
    const products = productTestResponse.data?.items || [];
    const validItem = products.length > 0 ? products[0] : null;
    const itemNumber = validItem?.itemNumber || "34RGPT3HVC"; // Fallback to hardcoded
    const itemUom = validItem?.unitOfMeasure || "EA" || "DR" || "RL" || "PC" || "CS";
    
    console.log("Using Item:", {
      itemNumber: itemNumber,
      itemName: validItem?.name,
      uom: itemUom,
      availableAtBranches: validItem?.branches
    });

    // axios.post(url, data, config)
    // filters and pagination go in the request body (data), not in config
    const accountResponse = await axios.post(
      `${credentials.apiBaseUrl}/api/account/v1/search/accounts`,
      {
        filters: [
          {
            key: "accountType",
            condition: "equals",
            values: ["ship-to"]
          },
        ],
        pagination: {
          itemsPerPage: 10,
          pageNumber: 1
        }
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("Account Response:", JSON.stringify(accountResponse.data, null, 2));

    // Extract valid ship-to numbers from account search
    const accounts = accountResponse.data?.accounts || [];
    const validShipTos = accounts.map(acc => ({
      number: acc.number,
      name: acc.name,
      branchNumber: acc.branchNumber
    }));
    
    console.log("Valid Ship-To Numbers:", validShipTos);
    
    // Use first valid ship-to if available, otherwise use hardcoded
    const shipToNumber = validShipTos.length > 0 
      ? validShipTos[0].number 
      : "2010466-2"; // Fallback
    const branchNumber = validShipTos.length > 0 
      ? validShipTos[0].branchNumber 
      : "118"; // Fallback
    
    console.log(`Using Ship-To: ${shipToNumber}, Branch: ${branchNumber}`);

    // Calculate delivery date (7 days from now, formatted as YYYY-MM-DD)
    const deliveryDate = new Date();
    deliveryDate.setDate(deliveryDate.getDate() + 7);
    const formattedDate = deliveryDate.toISOString().split('T')[0];
    
    console.log(`Using delivery date: ${formattedDate}`);

    // Prepare product and account data for payload building
    const productData = {
      itemNumber: itemNumber,
      itemUom: itemUom,
      validItem: validItem
    };
    
    const accountData = {
      shipToNumber: shipToNumber,
      branchNumber: branchNumber,
      validShipTos: validShipTos,
      formattedDate: formattedDate
    };

    // Build payload dynamically based on environment and flags
    const payload = buildPayload(context, credentials, productData, accountData);
    
    // Log payload for sandbox verification
    if (credentials.environment === "sandbox") {
        console.log("=== ABC SANDBOX ORDER PAYLOAD ===");
        console.log(JSON.stringify(payload, null, 2));
        console.log("=== END ABC SANDBOX ORDER PAYLOAD ===");
    }

    console.log("Order Payload:", JSON.stringify(payload, null, 2));

  

    const orderResponse = await axios.post(
      `${credentials.apiBaseUrl}/api/order/v2/orders`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("Order Response:", JSON.stringify(orderResponse.data, null, 2));

    // Check if order actually succeeded
    const orderData = orderResponse.data || {};
    const requestInfo = orderData.request || {};
    const orders = orderData.orders || [];
    
    if (requestInfo.ordersFailed > 0) {
      const failedOrder = orders.find(o => !o.confirmationNumber) || orders[0];
      console.error("Order failed:", {
        requestId: failedOrder?.requestId,
        message: failedOrder?.message,
        errors: failedOrder?.errors,
        fullResponse: orderData
      });
      
      return {
        success: false,
        message: "ABC Order submission failed",
        error: failedOrder?.message || "Order validation failed",
        orderResponse: orderData,
        requestId: failedOrder?.requestId,
        accountResponse: accountResponse.data,
        // Common issues to check:
        diagnostic: {
          branchNumber: payload[0]?.branchNumber,
          shipToNumber: payload[0]?.shipTo?.number,
          itemNumber: payload[0]?.lines?.[0]?.itemNumber,
          deliveryDate: payload[0]?.dates?.deliveryRequestedFor,
          note: "Check: 1) Ship-to valid for branch, 2) Item available at branch, 3) Date format, 4) Required fields"
        }
      };
    }

    return {
      success: true,
      message: `Order submitted successfully (${credentials.environment})`,
      orderResponse: orderData,
      confirmationNumber: orders[0]?.confirmationNumber,
      accountResponse: accountResponse.data,
      environment: credentials.environment,
    };

   
  } catch (error) {
    const status = error?.response?.status;
    const errorData = error?.response?.data;
    const errorMessage =
      errorData?.errorMessage ||
      errorData?.error?.errorMessage ||
      error?.message ||
      "Unknown error";
    const requestData = error?.config?.data;

    console.error(`Error ${status || "unknown"}:`, errorMessage);
    console.error("Full error response:", JSON.stringify(errorData, null, 2));
    console.error("Request that failed:", {
      url: error?.config?.url,
      method: error?.config?.method,
      branchNumber: requestData?.[0]?.branchNumber,
      shipToNumber: requestData?.[0]?.shipTo?.number,
      linesCount: requestData?.[0]?.lines?.length,
    });

    if (status === 401) {
      if (
        errorMessage.includes("Ship-To") ||
        errorMessage.includes("branch") ||
        errorMessage.includes("invalid")
      ) {
        console.error(
          "Issue: Invalid Ship-To or Branch Number for sandbox account"
        );
        console.error("  Branch:", requestData?.[0]?.branchNumber || "N/A");
        console.error("  Ship-To:", requestData?.[0]?.shipTo?.number || "N/A");
        console.error(
          "  Note: These values may work in production but not in sandbox"
        );
      } else {
        console.error("Issue: Authentication/Authorization failed");
        console.error(
          "  Check: Token scopes, account permissions, or API endpoint"
        );
      }
    }

    return {
      success: false,
      message:
        status === 401 ? "Authentication failed" : "Order placement failed",
      error: errorData || errorMessage,
      status: status || 500,
    };
  }
};
