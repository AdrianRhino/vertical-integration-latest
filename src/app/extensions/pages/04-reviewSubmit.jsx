import { useState, useEffect, useMemo } from "react";
import {
  Text,
  Button,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  Flex,
  Divider,
  Heading,
  ButtonRow,
  hubspot,
} from "@hubspot/ui-extensions";
import { moneyFormatter, formatAddressString } from "../helperFunctions/helper";
import { inputStage } from "../pipeline/input.js";
import { filterStage } from "../pipeline/filter.js";
import { checkInvariants } from "../invariants/checkInvariants.js";

const ReviewSubmit = ({
  fullOrder,
  setFullOrder,
  context,
  fetchCrmObjectProperties,
  parsedOrder,
  tagStatus,
  sendAlert,
  setOrderPage,
}) => {
  const [crmProperties, setCrmProperties] = useState({});
  const [sumTotalPrice, setSumTotalPrice] = useState(0);
  const [orderId, setOrderId] = useState("");
  const deliveryAddress = useMemo(
    () =>
      selectDeliveryAddress({
        orderDelivery: fullOrder?.delivery,
        parsedDelivery: parsedOrder?.delivery,
        crmAddress: crmProperties,
      }),
    [fullOrder?.delivery, parsedOrder?.delivery, crmProperties]
  );
  const deliveryAddressText = formatAddressString(deliveryAddress);

  useEffect(() => {
    // console.log("This is the context", context);
    fetchCrmObjectProperties([
      "customer_first_name",
      "customer_last_name",
      "address_line_1",
      "po_number",
    ]).then((properties) => {
      // console.log(properties);
      setCrmProperties(properties);
    });
    console.log("tagStatus", tagStatus);
  }, []);

  useEffect(() => {
    if (!orderId) {
      return;
    }
    setFullOrder((prev) => ({
      ...prev,
      orderId,
      selectedOrderId: orderId,
      orderStatus: "Draft",
    }));
  }, [orderId, setFullOrder]);

  const buildOrderPayload = () => {
    // Use new pipeline to build InternalOrder, then convert back to legacy format
    // This preserves existing behavior while using new architecture
    const { order: internalOrder, errors, warnings } = inputStage(
      fullOrder,
      parsedOrder,
      {}
    );

    // Convert InternalOrder back to legacy format for HubSpot storage
    const base = parsedOrder || {};
    const mergedDelivery = {
      ...(base.delivery || {}),
      ...(fullOrder.delivery || {}),
      // Map from InternalOrder if available
      address_line_1: internalOrder.delivery?.address?.line1 || base.delivery?.address_line_1 || fullOrder.delivery?.address_line_1 || "",
      city: internalOrder.delivery?.address?.city || base.delivery?.city || fullOrder.delivery?.city || "",
      state: internalOrder.delivery?.address?.state || base.delivery?.state || fullOrder.delivery?.state || "",
      zip_code: internalOrder.delivery?.address?.postalCode || base.delivery?.zip_code || fullOrder.delivery?.zip_code || "",
    };

    const mergedItems =
      fullOrder.fullOrderItems ?? base.fullOrderItems ?? [];

    const mergedTemplateItems =
      fullOrder.templateItems ?? base.templateItems ?? [];

    const addressSnapshot = {
      address_line_1: mergedDelivery.address_line_1 || "",
      city: mergedDelivery.city || "",
      state: mergedDelivery.state || "",
      zip_code: mergedDelivery.zip_code || "",
    };

    const placedOrderAddress = formatAddressString(mergedDelivery);

    return {
      ...base,
      ...fullOrder,
      supplier: internalOrder.supplier || fullOrder.supplier || base.supplier || "",
      ticket: fullOrder.ticket || base.ticket || "",
      template: fullOrder.template || base.template || "",
      orderType: fullOrder.orderType || base.orderType || "",
      delivery: mergedDelivery,
      fullOrderItems: mergedItems,
      templateItems: mergedTemplateItems,
      addressSnapshot,
      placed_order_address: placedOrderAddress,
    };
  };

  const sendDraftToHubspot = async (showAlert = true) => {
    const orderPayload = buildOrderPayload();
    const response = await hubspot.serverless("sendDraftToHubspot", {
      parameters: {
        fullOrder: orderPayload,
        dealId: context.crm.objectId,
        orderObjectId:
          orderPayload.selectedOrderId ||
          orderPayload.orderId ||
          fullOrder.selectedOrderId ||
          fullOrder.orderId ||
          null,
      },
    });
    console.log("response", response);
    const newOrderId = response.body.orderId;
    setOrderId(newOrderId);
    const savedOrderNumber =
      response.body.hubspotResponse?.properties?.order_id ||
      orderPayload?.orderNumber;
    const savedTimestamp =
      response.body.hubspotResponse?.properties?.last_saved_at;
    setFullOrder(() => ({
      ...orderPayload,
      orderNumber: savedOrderNumber,
      lastSavedAt: savedTimestamp,
      orderId: newOrderId,
      selectedOrderId: newOrderId,
    }));
    if (showAlert) {
      sendAlert({ message: "Order saved as draft", type: "success" });
    }
    // Send order to Supplier
    return newOrderId; // Return the orderId for use in .then()
  };

  const sendOrderToHubspot = async () => {
    let orderIdToReturn = null;
    if (parsedOrder && fullOrder.selectedOrderId) {
      // Using existing order - update its status
      orderIdToReturn = fullOrder.selectedOrderId;
      await setSubmitStatus("Submitted", orderIdToReturn);
      sendAlert({ message: "Order updated successfully", type: "success" });
    } else {
      // Creating new order - save then update status
      // Pass false to suppress the "saved as draft" alert since we'll show "Order created successfully" instead
      const newOrderId = await sendDraftToHubspot(false);
      orderIdToReturn = newOrderId;
      await setSubmitStatus("Submitted", newOrderId);
      sendAlert({ message: "Order created successfully", type: "success" });
    }
    return orderIdToReturn;
  };

  const setSubmitStatus = async (status, orderId) => {
    const orderIdToSubmit = orderId;
    const response = await hubspot.serverless("setSubmitStatus", {
      parameters: {
        status: status,
        orderId: orderIdToSubmit,
      },
    });
    console.log("response", response);
  };

  const TestData = [
    {
      qty: 1,
      uom: "EA",
      itemNumber: "111111",
      title: "Test",
      variant: "Test",
      unitPrice: 100.0,
    },
  ];

  
      const totalPrice = useMemo(() => {
    // Try fullOrder first, then parsedOrder as fallback
    const orderItems =
      fullOrder.fullOrderItems ||
      parsedOrder?.fullOrderItems ||
      [];
    const sumTotalPrice = orderItems.reduce(
      (sum, row) => sum + (Number(row.qty) || 0) * (Number(row.unitPrice) || 0),
      0
    );
    setSumTotalPrice(sumTotalPrice);
    setFullOrder((prev) =>
      prev?.orderTotal === sumTotalPrice
        ? prev
        : { ...prev, orderTotal: sumTotalPrice }
    );
    return sumTotalPrice;
  }, [fullOrder.fullOrderItems, parsedOrder?.fullOrderItems, setFullOrder]);

  const sendOrderToSupplier = async (orderIdForPDF) => {
    const orderPayload = buildOrderPayload();
    
    // Include orderId in the payload so PDF upload can associate with it
    if (orderIdForPDF) {
      orderPayload.orderId = orderIdForPDF;
      orderPayload.selectedOrderId = orderIdForPDF;
    }
    
    const response = await hubspot.serverless("sendOrderToSupplier", {
      parameters: {
        fullOrder: orderPayload,
        parsedOrder: parsedOrder || null, // Pass parsedOrder for unified order preparation
        dealId: context.crm.objectId, // Pass dealId for PDF association
      },
    });
    
    console.log("=== sendOrderToSupplier FULL RESPONSE ===");
    console.log(JSON.stringify(response, null, 2));
    
    // Extract PDF URL from response - check multiple possible locations
    const pdfUrl = response.body?.pdfUrl || 
                   response.body?.body?.pdfUrl || 
                   response?.pdfUrl;
    
    const orderIdToUpdate = orderIdForPDF || fullOrder.selectedOrderId || orderId;
    
    console.log("=== PDF URL EXTRACTION DEBUG ===");
    console.log({
      pdfUrl: pdfUrl,
      pdfUrlType: typeof pdfUrl,
      isDataUrl: pdfUrl?.startsWith?.('data:'),
      isHubSpotUrl: pdfUrl?.includes?.('hubspotusercontent'),
      orderIdToUpdate: orderIdToUpdate,
      orderIdForPDF: orderIdForPDF,
      fullOrderSelectedOrderId: fullOrder.selectedOrderId,
      orderIdState: orderId,
      responseBodyKeys: response.body ? Object.keys(response.body) : 'no body',
      responseBody: response.body
    });
    
    // Check if URL is a valid HubSpot file URL (preferred) or data URL (fallback for text properties)
    // Accepts both CDN URLs (hubspotusercontent, hubapi.com, cdn2.hubspot) and app URLs (app.hubspot.com/files/)
    const isHubSpotFileUrl = pdfUrl && 
                             typeof pdfUrl === 'string' && 
                             !pdfUrl.startsWith('data:') && 
                             (pdfUrl.startsWith('http://') || pdfUrl.startsWith('https://')) &&
                             (pdfUrl.includes('hubspotusercontent') || 
                              pdfUrl.includes('hubapi.com') || 
                              pdfUrl.includes('cdn2.hubspot') ||
                              pdfUrl.includes('app.hubspot.com/files/'));
    
    const isDataUrl = pdfUrl && typeof pdfUrl === 'string' && pdfUrl.startsWith('data:application/pdf;base64,');
    
    // If property is single-line text, we can save data URLs (though not ideal)
    // If property is URL type, only save HTTP/HTTPS URLs
    // For now, allow both but prefer HubSpot file URLs
    const canSaveUrl = (isHubSpotFileUrl || isDataUrl) && orderIdToUpdate;
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/b131dc2d-5624-4f61-98fb-efc543f7726a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'04-reviewSubmit.jsx:272',message:'URL_VALIDATION',data:{hasPdfUrl:!!pdfUrl,pdfUrl:pdfUrl?.substring(0,150),isHubSpotFileUrl,isDataUrl,canSaveUrl,hasOrderId:!!orderIdToUpdate},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'H3'})}).catch(()=>{});
    // #endregion
    
    // If PDF URL exists (HubSpot file URL or data URL), update the order
    if (canSaveUrl) {
      try {
        if (isHubSpotFileUrl) {
          console.log("=== ATTEMPTING TO SAVE HUBSPOT PDF FILE URL ===");
        } else if (isDataUrl) {
          console.log("=== ATTEMPTING TO SAVE PDF DATA URL (fallback) ===");
          console.warn("⚠️ Saving data URL - PDF upload to HubSpot Files API failed. Check serverless logs for details.");
        }
        console.log({ 
          pdfUrl: pdfUrl.substring(0, 100) + (pdfUrl.length > 100 ? '...' : ''), 
          orderId: orderIdToUpdate,
          urlType: isHubSpotFileUrl ? 'HubSpot File URL' : isDataUrl ? 'Data URL' : 'Unknown'
        });
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/b131dc2d-5624-4f61-98fb-efc543f7726a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'04-reviewSubmit.jsx:289',message:'CALLING_SETSUBMITSTATUS',data:{orderId:orderIdToUpdate,hasPdfUrl:!!pdfUrl,pdfUrl:pdfUrl?.substring(0,150)},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'H3'})}).catch(()=>{});
        // #endregion
        
        const updateResponse = await hubspot.serverless("setSubmitStatus", {
          parameters: {
            status: "Submitted", // Maintain status
            orderId: orderIdToUpdate,
            pdfUrl: pdfUrl, // Pass PDF URL to save in order_pdf property
          },
        });
        
        console.log("=== setSubmitStatus RESPONSE ===");
        console.log(JSON.stringify(updateResponse, null, 2));
        if (isHubSpotFileUrl) {
          console.log("✅ HubSpot PDF file URL saved to order_pdf property successfully");
        } else {
          console.log("✅ PDF data URL saved to order_pdf property (upload failed, using fallback) ");
          console.warn("⚠️ NOTE: Data URLs are very large. Consider fixing PDF upload to use HubSpot Files API.");
        }
      } catch (error) {
        console.error("❌ Failed to save PDF URL to order:", error);
        console.error("Error details:", error.response || error.message);
        console.error("Full error:", JSON.stringify(error, null, 2));
      }
    } else {
      if (!pdfUrl) {
        console.warn("⚠️ No PDF URL found in response");
      } else if (!isHubSpotFileUrl && !isDataUrl) {
        console.warn("⚠️ PDF URL format not recognized:", pdfUrl?.substring(0, 100));
      }
      if (!orderIdToUpdate) {
        console.warn("⚠️ No orderId available to update");
      }
      console.warn("⚠️ Cannot save PDF URL - missing data:", {
        hasPdfUrl: !!pdfUrl,
        isHubSpotFileUrl: isHubSpotFileUrl,
        isDataUrl: isDataUrl,
        hasOrderId: !!orderIdToUpdate,
        pdfUrl: pdfUrl ? pdfUrl.substring(0, 100) + '...' : null,
        orderId: orderIdToUpdate,
        responseBody: response.body
      });
    }
    
    return response;
  };
    

  return (
    <>
      <Text>Order Review</Text>
      <Text></Text>
      <Flex direction={"row"} gap="xs">
        <Flex direction={"column"}>
          <Flex direction={"row"} gap="xs">
            <Text format={{ fontWeight: "bold" }}>Customer Name:</Text>
            <Text>
              {crmProperties.customer_first_name}{" "}
              {crmProperties.customer_last_name}
            </Text>
          </Flex>
          <Flex direction={"row"} gap="xs">
            <Text format={{ fontWeight: "bold" }}>Delivery Address:</Text>
            <Text>{deliveryAddressText || "N/A"}</Text>
          </Flex>
          <Flex direction={"row"} gap="xs">
            <Text format={{ fontWeight: "bold" }}>Delivery Date:</Text>
            <Text>
              {fullOrder.delivery?.delivery_date?.formattedDate ||
                parsedOrder?.delivery?.delivery_date?.formattedDate ||
                "N/A"}
            </Text>
          </Flex>
          <Flex direction={"row"} gap="xs">
            <Text format={{ fontWeight: "bold" }}>Selected Ticket:</Text>
            <Text>{fullOrder?.ticket || parsedOrder?.ticket || "N/A"}</Text>
          </Flex>
          <Flex direction={"row"} gap="xs">
            <Text format={{ fontWeight: "bold" }}>PO Number:</Text>
            <Text>{crmProperties.po_number}</Text>
          </Flex>
          <Flex direction={"row"} gap="xs">
            <Text format={{ fontWeight: "bold" }}>Template:</Text>
            <Text>{fullOrder?.template || parsedOrder?.template || "N/A"}</Text>
          </Flex>
        </Flex>
        <Flex direction={"column"} gap="xs">
          <Flex direction={"row"} gap="xs">
            <Text format={{ fontWeight: "bold" }}>Order Name:</Text>
            <Text>TBD</Text>
          </Flex>
          <Flex direction={"row"} gap="xs">
            <Text format={{ fontWeight: "bold" }}>Delivery Type:</Text>
            <Text>
              {fullOrder.delivery?.delivery_type ||
                parsedOrder?.delivery?.delivery_type ||
                "N/A"}
            </Text>
          </Flex>
          <Flex direction={"row"} gap="xs">
            <Text format={{ fontWeight: "bold" }}>Primary Contact:</Text>
            <Text>
              {fullOrder.delivery?.primary_contact ||
                parsedOrder?.delivery?.primary_contact ||
                "N/A"}
            </Text>
          </Flex>
          <Flex direction={"row"} gap="xs">
            <Text format={{ fontWeight: "bold" }}>Contact Info:</Text>
            <Text>TBD</Text>
          </Flex>
          <Flex direction={"row"} gap="xs">
            <Text format={{ fontWeight: "bold" }}>Delivery Instructions:</Text>
            <Text>
              {fullOrder.delivery?.delivery_instructions ||
                parsedOrder?.delivery?.delivery_instructions ||
                "N/A"}
            </Text>
          </Flex>
        </Flex>
      </Flex>

      <Text></Text>
      <Table bordered={true} paginated={false}>
        <TableHead>
          <TableRow>
            <TableHeader width="min">Quantity</TableHeader>
            <TableHeader width="min">U/M</TableHeader>
            <TableHeader width="min">SKU</TableHeader>
            <TableHeader width="min">Title</TableHeader>
            <TableHeader width="min">Variant</TableHeader>
            <TableHeader width="min">Unit Price</TableHeader>
            <TableHeader width="min">Line Price</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {(fullOrder.fullOrderItems || parsedOrder?.fullOrderItems || []).map(
            (line) => (
              <TableRow>
                <TableCell width="min">{line.qty}</TableCell>
                <TableCell width="min">
                  <Text variant="microcopy">{line.uom}</Text>
                </TableCell>
                <TableCell width="min">
                  <Text variant="microcopy">{line.sku}</Text>
                </TableCell>
                <TableCell width="min">
                  <Text variant="microcopy">{line.title}</Text>
                </TableCell>
                <TableCell width="min">
                  <Text variant="microcopy">{line.variant}</Text>
                </TableCell>
                <TableCell width="min">
                  <Text variant="microcopy">
                    {`$` +
                      moneyFormatter("unitPrice", line.unitPrice) +
                      `/${line.qty}`}
                  </Text>
                </TableCell>
                <TableCell width="min">
                  <Text variant="microcopy">
                    {"$" +
                      moneyFormatter("linePrice", line.unitPrice, line.qty)}
                  </Text>
                </TableCell>
              </TableRow>
            )
          )}
        </TableBody>
      </Table>
      <Text></Text>
      <Divider />
      <Flex justify="end" gap="xs">
        <Heading>Price: </Heading>
        <Heading>${sumTotalPrice.toFixed(2)}</Heading>
      </Flex>

      {tagStatus === "Submitted" ? (
        <>
          
        </>
      ) : (
        <>
          {" "}
          <ButtonRow>
            <Button variant="primary" onClick={async () => {
              try {
                // Get current timestamp
                const submitTime = new Date();
                const formattedTime = submitTime.toLocaleString('en-US', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  hour12: true
                });
                
                console.log(`🕐 Order submission started at: ${formattedTime}`);
                sendAlert({ 
                  message: `Submitting order at ${formattedTime}...`, 
                  type: "info" 
                });
                
                // Step 1: Create/update order in HubSpot and get orderId
                const orderId = await sendOrderToHubspot();
                
                // Step 2: Send order to supplier (generates PDF) and save PDF URL
                await sendOrderToSupplier(orderId);
                
                // Show completion time
                const completionTime = new Date();
                const formattedCompletionTime = completionTime.toLocaleString('en-US', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  hour12: true
                });
                
                const duration = ((completionTime - submitTime) / 1000).toFixed(2);
                
                console.log(`✅ Order submission completed at: ${formattedCompletionTime} (Duration: ${duration}s)`);
                sendAlert({ 
                  message: `Order submitted successfully at ${formattedCompletionTime}`, 
                  type: "success" 
                });
                
                setOrderPage(5);
              } catch (error) {
                const errorTime = new Date().toLocaleString('en-US', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  hour12: true
                });
                
                console.error(`❌ Error submitting order at ${errorTime}:`, error);
                sendAlert({ 
                  message: `Error submitting order at ${errorTime}. Please try again.`, 
                  type: "error" 
                });
              }
              }}>
              Submit Order
            </Button>
            <Button variant="secondary" onClick={() => sendDraftToHubspot()}>
              Save as Draft
            </Button>
          </ButtonRow>
          <ButtonRow>
            <Button 
              variant="secondary" 
              onClick={async () => {
                try {
                  console.log('🧪 Testing PDF generation and upload...');
                  sendAlert({ message: "Testing PDF upload...", type: "info" });
                  
                  const response = await hubspot.serverless("testPDFUpload", {
                    parameters: {
                      orderId: fullOrder.selectedOrderId || orderId || null,
                      dealId: context.crm.objectId
                    }
                  });
                  
                  console.log('=== TEST PDF UPLOAD RESPONSE ===');
                  console.log(JSON.stringify(response, null, 2));
                  
                  if (response.body?.success) {
                    const message = `✅ PDF uploaded successfully!\nURL: ${response.body.pdfUrl}\nSize: ${response.body.pdfSizeKB} KB`;
                    console.log(message);
                    sendAlert({ 
                      message: `PDF uploaded successfully! URL: ${response.body.pdfUrl.substring(0, 50)}...`, 
                      type: "success" 
                    });
                  } else {
                    const errorMsg = response.body?.error || response.body?.message || 'Unknown error';
                    console.error('❌ Test failed:', errorMsg);
                    sendAlert({ 
                      message: `Test failed: ${errorMsg}`, 
                      type: "error" 
                    });
                  }
                } catch (error) {
                  console.error('❌ Test error:', error);
                  sendAlert({ 
                    message: `Test error: ${error.message}`, 
                    type: "error" 
                  });
                }
              }}
            >
              🧪 Test PDF Upload
            </Button>
            <Button variant="secondary" onClick={() => setOrderPage(8)}>Go to Testing Panel</Button>
          </ButtonRow>
        </>
      )}
    </>
  );
};

export default ReviewSubmit;

// SHAPE: Input → Filter → Transform → Store → Output → Loop
// INPUT: { orderDelivery, parsedDelivery, crmAddress }
// FILTER: prefer non-empty values from latest order edits, then parsed payload, then CRM
// TRANSFORM: normalize CRM fields into delivery shape
// STORE: return the chosen delivery object
// OUTPUT: delivery object for display/payload usage
// LOOP: safe to call whenever any upstream source changes
function selectDeliveryAddress({ orderDelivery, parsedDelivery, crmAddress }) {
  if (hasAnyValue(orderDelivery)) return orderDelivery;
  if (hasAnyValue(parsedDelivery)) return parsedDelivery;

  const crmDelivery = {
    address_line_1: crmAddress?.address_line_1,
    city: crmAddress?.city,
    state: crmAddress?.state,
    zip_code: crmAddress?.zip_code,
  };

  if (hasAnyValue(crmDelivery)) return crmDelivery;
  return {};
}

function hasAnyValue(obj = {}) {
  return Object.values(obj || {}).some((value) => {
    if (value === null || value === undefined) return false;
    if (typeof value === "string") return value.trim().length > 0;
    return true;
  });
}
