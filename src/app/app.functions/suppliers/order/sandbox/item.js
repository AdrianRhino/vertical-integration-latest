const hardcodedOrder = [{
    "requestId": "12345", // Random number for uniqueness
    "trackingId": "", // Optional
    "purchaseOrder": "999999-9", // Optional
    "branchNumber": branchNumber, // Must be valid for your sandbox account
    "deliveryService": "OTG",
    "typeCode": "SO", // Delivery Request
    "dates": {
      "deliveryRequestedFor": "2026-03-05"
    },
    "deliveryAppointment": {
      "instructionsTypeCode": "AT",
      "instructions": "Please leave in driveway",
      "fromTime": "10:00", // Default if missing
      "toTime": "11:00", // Default if missing
      "timeZoneCode": "CT" // Central Time - Should be dynamic if applicable
    },
    "currency": "USD",
    "shipTo": {
      "number": shipToNumber, // Must be valid for your sandbox account
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
          "functionCode": "SM", // Site Manager/Contact
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
            "id": "1",            // string ID (required by API)
            "itemNumber": "79BBL30HG5",  // SKU/item number
            "itemDescription": "Test Product Description", // Product description (required)
            "orderedQty": {
              "value": 1,          // quantity ordered
              "uom": "EA"          // unit of measure (EA, DR, RL, PC, etc.)
            },
            "unitPrice": {
              "value": 0.00,       // unit price (required by API)
              "uom": "EA",         // unit of measure (required by API)
              "instructions": ""   // required by API (can be empty)
            },
            "comments": {
              "code": "D",         // Comment code (D = Description/Detail)
              "description": "TEST ORDER - DO NOT FULFILL" // Line comment text
            }
          }
    ]
  }];