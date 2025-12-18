# Vertical Integration Extension

## Overview

A simplified HubSpot UI extension for managing material orders with suppliers (ABC, SRS, Beacon). The system uses simple arrays and objects with straightforward functions - no complex abstractions.

## Architecture

The extension follows a simple, straightforward design:
- **Single order state** - One `order` object with simple fields (supplier, ticket, template, items array, delivery object)
- **Simple functions** - Direct operations on arrays and objects, no pipeline abstractions
- **Config-driven** - Supplier-specific logic in JSON configs (in app.functions)
- **Serverless functions** - Backend processing handled by HubSpot serverless functions

## File Structure

```
/extensions/
  Example.jsx                    # Main entry point, manages order state and page routing
  /pages/
    00-orderStart.jsx           # Order selection (new/draft/submitted)
    01-pickupSetup.jsx          # Supplier, ticket, template selection
    02-pricingTable.jsx         # Product search and line items
    03-deliveryForm.jsx         # Delivery address and details
    04-reviewSubmit.jsx         # Order review and submission
    05-successPage.jsx          # Success confirmation
    06-orderTesting.jsx         # Testing utilities
    07-loginTesting.jsx         # Login testing
    08-abcSandboxOrder.jsx      # Sandbox order testing
  /helperFunctions/
    helper.js                   # Utility functions (moneyFormatter, formatAddressString, units)
    appOptions.js               # Dropdown options (suppliers, templates)
    componentRender.jsx         # Field rendering utilities
    AddressDisplay.jsx          # Address display/edit component
    prefillDeliveryAddress.js  # Address prefill from CRM
    normalizeValue.js           # Value normalization for form fields
  /config/
    addressPrefill.json         # Address field mapping config
  package.json                  # Dependencies
```

## Order State

The order object is a simple structure:

```javascript
{
  supplier: "",           // "abc", "srs", or "beacon"
  ticket: "",             // Ticket ID
  template: "",           // Template name
  orderType: "",          // "New Order", "Draft Order", etc.
  items: [],              // Array of line items
  delivery: {},           // Delivery address and details
  status: "Draft",        // Order status
  orderId: "",            // HubSpot order ID
  selectedOrderId: "",    // Selected draft/submitted order ID
  selectedOrder: null     // Full selected order object
}
```

## Key Features

1. **Draft Management** - Save and load draft orders
2. **Product Search** - Search supplier catalogs via Supabase
3. **Pricing** - Fetch pricing from supplier APIs
4. **Order Submission** - Submit orders to suppliers (ABC, SRS, Beacon)
5. **PDF Generation** - Generate and upload order PDFs to HubSpot

## Serverless Functions

The extension calls these serverless functions (defined in `app.functions/`):

- `getDraftOrders` - Load draft/submitted orders
- `getTickets` - Get ticket list
- `getProductionTeam` - Get production team members
- `supplierProducts` - Search products (Supabase)
- `abcPricing`, `srsPricing`, `beaconPricing` - Get pricing
- `sendDraftToHubspot` - Save draft order
- `sendOrderToSupplier` - Submit order to supplier
- `generateAndUploadOrderPDF` - Generate and upload PDF
- `setSubmitStatus` - Update order status

## Order Processing Flow

1. **User selects order type** (new/draft/submitted) → `00-orderStart.jsx`
2. **User selects supplier, ticket, template** → `01-pickupSetup.jsx`
3. **User adds products and gets pricing** → `02-pricingTable.jsx`
4. **User enters delivery details** → `03-deliveryForm.jsx`
5. **User reviews and submits** → `04-reviewSubmit.jsx`
   - Saves to HubSpot as draft/submitted
   - Submits to supplier API
   - Generates PDF and uploads to HubSpot

## Principles

1. **Simplicity** - Use simple arrays and objects, avoid complex abstractions
2. **Direct operations** - Simple loops and object updates, no pipelines
3. **Config-driven** - Supplier-specific logic in JSON configs (backend)
4. **Self-healing** - Missing data gets safe defaults
5. **Functionality preserved** - All features work the same, just simpler code
