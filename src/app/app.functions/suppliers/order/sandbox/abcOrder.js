const axios = require("axios");

exports.main = async (context = {}) => {

   const abcClientId = process.env.ABCClientSandbox;
   const abcClientSecret = process.env.ABCClientSecretSandbox;

   // ABCClientSandbox='0oa21mviomnaC6L6H0h8'
   // ABCClientSecretSandbox='BZAXkpWAxVqxvAN11J3uHaTe0Q4CtCYw2fnRvigh48VpGmnuZfKgMvt8aBBG-EJR'

   const abcBasic64AuthKey = Buffer.from(`${abcClientId}:${abcClientSecret}`).toString('base64');

   const config = {
    method: "post",
    url: "https://sandbox.auth.partners.abcsupply.com/oauth2/aus1vp07knpuqf6Xz0h8/v1/token?grant_type=client_credentials&scope=location.read product.read pricing.read account.read order.write order.read",
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
        status: 401
      };
    }

    const token = response.data.access_token;
    console.log("Token:", token ? "✓" : "✗");

    const productTestResponse = await axios({
      method: "get",
      url: "https://partners-sb.abcsupply.com/api/product/v1/items?itemsPerPage=1&pageNumber=1&embed=branches",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      timeout: 30000
    });

    console.log("Product Test Response:", productTestResponse.data);

    const payload = [
      {
        requestId: "sandbox-test-1",
        purchaseOrder: "TEST-PO-1",
        branchNumber: "461",          // or whatever sandbox branch they gave you
        deliveryService: "OTG",
        typeCode: "SO",
        dates: { deliveryRequestedFor: "2026-03-05" },
        deliveryAppointment: {
          instructionsTypeCode: "AT",
          instructions: "Sandbox test order",
          fromTime: "10:00",
          toTime: "11:00",
          timeZoneCode: "CT",
        },
        currency: "USD",
        shipTo: {
          name: "Sandbox Test",
          number: "855708",        // or a known sandbox ship-to
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
            itemNumber: "34RGPT3HVC",  // from your product test response
            orderedQty: { value: 1, uom: "EA" },
            unitPrice: { value: 1.0, uom: "EA", instructions: "Sandbox test" },
          },
        ],
      },
    ];
    
    await axios.post(
      "https://partners-sb.abcsupply.com/api/order/v2/orders",
      payload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    
    return {
      success: true,
      message: "Product Test Response",
      data: productTestResponse.data
    }
    
    console.log("Placing order...");
    
    const orderConfig = {
      method: "post",
      url: "https://partners-sb.abcsupply.com/api/order/v2/orders",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      data: [{
          "requestId": "12345",
          "trackingId": "",
          "purchaseOrder": "999999-9",
          "branchNumber": "461",
          "deliveryService": "OTG",
          "typeCode": "SO",
          "dates": {
            "deliveryRequestedFor": "2026-03-05"
          },
          "deliveryAppointment": {
            "instructionsTypeCode": "AT",
            "instructions": "Please leave in driveway",
            "fromTime": "10:00",
            "toTime": "11:00",
            "timeZoneCode": "CT"
          },
          "currency": "USD",
          "shipTo": {
            "number": "855712",
            "address": {
              "line1": "123 Main St",
              "line2": "Apt 1",
              "line3": "",
              "city": "Anytown",
              "state": "TX",
              "postal": "12345",
              "country": "USA"
            },
            "contacts": [
              {
                "name": "Adrian Johnson",
                "functionCode": "SM",
                "email": "adrian@rhinoroofers.com",
                "phones": [
                  {
                    "number": "555-555-5555",
                    "type": "MOBILE",
                    "ext": ""
                  }
                ]
              }
            ]
          },
          "lines": [
              {
                  "id": "1",
                  "itemNumber": "79BBL30HG5",
                  "itemDescription": "Test Product Description",
                  "orderedQty": {
                    "value": 1,
                    "uom": "EA"
                  },
                  "unitPrice": {
                    "value": 0.00,
                    "uom": "EA",
                    "instructions": ""
                  },
                  "comments": {
                    "code": "D",
                    "description": "TEST ORDER - DO NOT FULFILL"
                  }
                }
          ]
        }],
      };

      console.log("Request URL:", orderConfig.url);
      console.log("Request payload:", JSON.stringify(orderConfig.data, null, 2));
      
      const orderResponse = await axios(orderConfig);
      console.log("Order placed successfully ✓");
      return {
        success: true,
        message: "Order placed successfully",
        data: orderResponse.data
      };
  } catch (error) {
    const status = error?.response?.status;
    const errorData = error?.response?.data;
    const errorMessage = errorData?.errorMessage || errorData?.error?.errorMessage || error?.message || "Unknown error";
    const requestData = error?.config?.data;
    
    console.error(`Error ${status || 'unknown'}:`, errorMessage);
    console.error("Full error response:", JSON.stringify(errorData, null, 2));
    console.error("Request that failed:", {
      url: error?.config?.url,
      method: error?.config?.method,
      branchNumber: requestData?.[0]?.branchNumber,
      shipToNumber: requestData?.[0]?.shipTo?.number,
      linesCount: requestData?.[0]?.lines?.length
    });
    
    if (status === 401) {
      if (errorMessage.includes("Ship-To") || errorMessage.includes("branch") || errorMessage.includes("invalid")) {
        console.error("Issue: Invalid Ship-To or Branch Number for sandbox account");
        console.error("  Branch:", requestData?.[0]?.branchNumber || "N/A");
        console.error("  Ship-To:", requestData?.[0]?.shipTo?.number || "N/A");
        console.error("  Note: These values may work in production but not in sandbox");
      } else {
        console.error("Issue: Authentication/Authorization failed");
        console.error("  Check: Token scopes, account permissions, or API endpoint");
      }
    }
    
    return {
      success: false,
      message: status === 401 ? "Authentication failed" : "Order placement failed",
      error: errorData || errorMessage,
      status: status || 500
    };
  }
}