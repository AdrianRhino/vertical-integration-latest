import { useState, useEffect } from "react";
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

const ReviewSubmit = ({
  order,
  setOrder,
  context,
  fetchCrmObjectProperties,
  runServerless,
  sendAlert,
  setCurrentPage,
  setCanGoNext,
}) => {
  const [crmProperties, setCrmProperties] = useState({});
  const [orderTotal, setOrderTotal] = useState(0);
  const [orderId, setOrderId] = useState(order.orderId || order.selectedOrderId || "");

  // Load customer info from deal
  useEffect(() => {
    fetchCrmObjectProperties([
      "customer_first_name",
      "customer_last_name",
      "address_line_1",
      "po_number",
    ]).then((properties) => {
      setCrmProperties(properties || {});
    });
  }, []);

  // Calculate total from items (simple loop)
  useEffect(() => {
    let total = 0;
    const items = order.items || [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const qty = Number(item.qty) || 0;
      const price = Number(item.unitPrice) || 0;
      total = total + qty * price;
    }
    setOrderTotal(total);
    setOrder((prev) => ({ ...prev, orderTotal: total }));
  }, [order.items]);

  // Update orderId when order changes
  useEffect(() => {
    if (order.orderId || order.selectedOrderId) {
      setOrderId(order.orderId || order.selectedOrderId);
    }
  }, [order.orderId, order.selectedOrderId]);

  // Simple function to build order payload (no pipeline, just copy order data)
  const buildOrderPayload = () => {
    const delivery = order.delivery || {};
    const items = order.items || [];
    
    // Simple address string
    const addressParts = [];
    if (delivery.address_line_1) addressParts.push(delivery.address_line_1);
    if (delivery.city) addressParts.push(delivery.city);
    if (delivery.state && delivery.zip_code) {
      addressParts.push(delivery.state + " " + delivery.zip_code);
    } else if (delivery.state) {
      addressParts.push(delivery.state);
    } else if (delivery.zip_code) {
      addressParts.push(delivery.zip_code);
    }
    const addressString = addressParts.join(", ");

    // Simple order object - just copy what we have
    // Note: Serverless functions expect fullOrderItems, so we use that field name
    return {
      supplier: order.supplier || "",
      ticket: order.ticket || "",
      template: order.template || "",
      orderType: order.orderType || "",
      orderId: order.orderId || order.selectedOrderId || null,
      selectedOrderId: order.selectedOrderId || order.orderId || null,
      delivery: delivery,
      fullOrderItems: items, // Serverless functions expect this field name
      items: items, // Also include items for consistency
      templateItems: order.templateItems || [],
      addressSnapshot: {
        address_line_1: delivery.address_line_1 || "",
        city: delivery.city || "",
        state: delivery.state || "",
        zip_code: delivery.zip_code || "",
      },
      placed_order_address: addressString,
      orderTotal: orderTotal,
      orderStatus: order.status || "Draft",
    };
  };

  // Simple function to save draft
  const saveDraft = async () => {
    try {
      const orderPayload = buildOrderPayload();
      const orderObjectId = order.orderId || order.selectedOrderId || null;

      const response = await hubspot.serverless("sendDraftToHubspot", {
        parameters: {
          fullOrder: orderPayload,
          dealId: context.crm.objectId,
          orderObjectId: orderObjectId,
        },
      });

      if (response.body?.ok === false || response.statusCode >= 400) {
        const errorMsg = response.body?.error || response.body?.message || "Failed to save draft";
        sendAlert({ message: `Failed to save draft: ${errorMsg}`, type: "danger" });
        return;
      }

      const newOrderId = response.body?.orderId;
      if (newOrderId) {
        setOrderId(newOrderId);
        setOrder((prev) => ({
          ...prev,
          orderId: newOrderId,
          selectedOrderId: newOrderId,
          status: "Draft",
        }));
        sendAlert({ message: "Order saved as draft", type: "success" });
      }
    } catch (error) {
      console.error("Error saving draft:", error);
      sendAlert({ message: `Error saving draft: ${error.message || "Unknown error"}`, type: "danger" });
    }
  };

  // Simple function to update order status
  const updateOrderStatus = async (status, orderIdToUpdate, pdfUrl = null) => {
    const params = {
      status: status,
      orderId: orderIdToUpdate,
    };
    if (pdfUrl) {
      params.pdfUrl = pdfUrl;
    }
    return await hubspot.serverless("setSubmitStatus", { parameters: params });
  };

  // Simple function to save order to HubSpot
  const saveOrderToHubspot = async () => {
    const existingOrderId = order.orderId || order.selectedOrderId || orderId;
    
    if (existingOrderId) {
      await updateOrderStatus("Submitted", existingOrderId);
      sendAlert({ message: "Order updated successfully", type: "success" });
      return existingOrderId;
    } else {
      await saveDraft();
      const newOrderId = order.orderId || order.selectedOrderId;
      if (newOrderId) {
        await updateOrderStatus("Submitted", newOrderId);
        sendAlert({ message: "Order created successfully", type: "success" });
        return newOrderId;
      }
      throw new Error("No order ID after saving draft");
    }
  };

  // Simple function to send order to supplier
  const sendOrderToSupplier = async (orderIdForPDF) => {
    const orderPayload = buildOrderPayload();
    
    if (orderIdForPDF) {
      orderPayload.orderId = orderIdForPDF;
      orderPayload.selectedOrderId = orderIdForPDF;
    }

    // Step 1: Send to supplier
    console.log("=== STEP 1: SUBMITTING ORDER TO SUPPLIER ===");
    const orderResponse = await hubspot.serverless("sendOrderToSupplier", {
      parameters: {
        fullOrder: orderPayload,
        parsedOrder: null,
        dealId: context.crm.objectId,
      },
    });

    const orderIdToUpdate = orderIdForPDF || order.orderId || order.selectedOrderId || orderId;

    // Step 2: Generate PDF
    console.log("=== STEP 2: GENERATING AND UPLOADING PDF ===");
    let pdfUrl = null;
    try {
      const pdfResponse = await hubspot.serverless("generateAndUploadOrderPDF", {
        parameters: {
          fullOrder: orderPayload,
          parsedOrder: null,
          orderResult: orderResponse.body || {},
          orderId: orderIdToUpdate,
          dealId: context.crm.objectId,
        },
      });

      if (pdfResponse.body?.success && pdfResponse.body?.pdfUrl) {
        pdfUrl = pdfResponse.body.pdfUrl;
        console.log("✅ PDF generated and uploaded successfully");
      }
    } catch (pdfError) {
      console.error("❌ PDF generation/upload failed:", pdfError);
    }

    // Step 3: Save PDF URL to order
    if (pdfUrl && orderIdToUpdate) {
      const isHubSpotUrl = pdfUrl.includes('hubspotusercontent') || pdfUrl.includes('hubapi.com') || pdfUrl.includes('app.hubspot.com/files/');
      const isDataUrl = pdfUrl.startsWith('data:application/pdf;base64,');

      if (isHubSpotUrl || isDataUrl) {
        try {
          await updateOrderStatus("Submitted", orderIdToUpdate, pdfUrl);
          console.log("✅ PDF URL saved to order");
        } catch (error) {
          console.error("❌ Failed to save PDF URL:", error);
        }
      }
    } else if (orderIdToUpdate) {
      // Update status even without PDF
      try {
        await updateOrderStatus("Submitted", orderIdToUpdate);
        console.log("✅ Order status updated");
      } catch (error) {
        console.error("❌ Failed to update order status:", error);
      }
    }

    return orderResponse;
  };

  // Simple function to get delivery address for display
  const getDeliveryAddress = () => {
    const delivery = order.delivery || {};
    return formatAddressString(delivery) || "N/A";
  };

  // Simple function to get delivery date
  const getDeliveryDate = () => {
    const delivery = order.delivery || {};
    if (delivery.delivery_date && delivery.delivery_date.formattedDate) {
      return delivery.delivery_date.formattedDate;
    }
    return "N/A";
  };

  const items = order.items || [];
  const isSubmitted = order.status === "Submitted";

  return (
    <>
      <Text>Order Review</Text>
      <Text></Text>
      <Flex direction={"row"} gap="xs">
        <Flex direction={"column"}>
          <Flex direction={"row"} gap="xs">
            <Text format={{ fontWeight: "bold" }}>Customer Name:</Text>
            <Text>
              {crmProperties.customer_first_name || ""} {crmProperties.customer_last_name || ""}
            </Text>
          </Flex>
          <Flex direction={"row"} gap="xs">
            <Text format={{ fontWeight: "bold" }}>Delivery Address:</Text>
            <Text>{getDeliveryAddress()}</Text>
          </Flex>
          <Flex direction={"row"} gap="xs">
            <Text format={{ fontWeight: "bold" }}>Delivery Date:</Text>
            <Text>{getDeliveryDate()}</Text>
          </Flex>
          <Flex direction={"row"} gap="xs">
            <Text format={{ fontWeight: "bold" }}>Selected Ticket:</Text>
            <Text>{order.ticket || "N/A"}</Text>
          </Flex>
          <Flex direction={"row"} gap="xs">
            <Text format={{ fontWeight: "bold" }}>PO Number:</Text>
            <Text>{crmProperties.po_number || "N/A"}</Text>
          </Flex>
          <Flex direction={"row"} gap="xs">
            <Text format={{ fontWeight: "bold" }}>Template:</Text>
            <Text>{order.template || "N/A"}</Text>
          </Flex>
        </Flex>
        <Flex direction={"column"} gap="xs">
          <Flex direction={"row"} gap="xs">
            <Text format={{ fontWeight: "bold" }}>Order Name:</Text>
            <Text>TBD</Text>
          </Flex>
          <Flex direction={"row"} gap="xs">
            <Text format={{ fontWeight: "bold" }}>Delivery Type:</Text>
            <Text>{order.delivery?.delivery_type || "N/A"}</Text>
          </Flex>
          <Flex direction={"row"} gap="xs">
            <Text format={{ fontWeight: "bold" }}>Primary Contact:</Text>
            <Text>{order.delivery?.primary_contact || "N/A"}</Text>
          </Flex>
          <Flex direction={"row"} gap="xs">
            <Text format={{ fontWeight: "bold" }}>Contact Info:</Text>
            <Text>TBD</Text>
          </Flex>
          <Flex direction={"row"} gap="xs">
            <Text format={{ fontWeight: "bold" }}>Delivery Instructions:</Text>
            <Text>{order.delivery?.delivery_instructions || "N/A"}</Text>
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
          {items.map((line, index) => (
            <TableRow key={index}>
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
                <Text variant="microcopy">{line.variant || ""}</Text>
              </TableCell>
              <TableCell width="min">
                <Text variant="microcopy">
                  ${moneyFormatter("unitPrice", line.unitPrice)}/{line.qty}
                </Text>
              </TableCell>
              <TableCell width="min">
                <Text variant="microcopy">
                  ${moneyFormatter("linePrice", line.unitPrice, line.qty)}
                </Text>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Text></Text>
      <Divider />
      <Flex justify="end" gap="xs">
        <Heading>Price: </Heading>
        <Heading>${orderTotal.toFixed(2)}</Heading>
      </Flex>

      {isSubmitted ? (
        <></>
      ) : (
        <>
          <ButtonRow>
            <Button
              variant="primary"
              onClick={async () => {
                try {
                  const submitTime = new Date();
                  const timeString = submitTime.toLocaleString('en-US', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: true
                  });

                  sendAlert({ message: `Submitting order at ${timeString}...`, type: "info" });

                  // Step 1: Save to HubSpot
                  const savedOrderId = await saveOrderToHubspot();

                  // Step 2: Send to supplier and generate PDF
                  await sendOrderToSupplier(savedOrderId);

                  // Update order status
                  setOrder((prev) => ({ ...prev, status: "Submitted" }));

                  const completionTime = new Date();
                  const completionString = completionTime.toLocaleString('en-US', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: true
                  });

                  sendAlert({
                    message: `Order submitted successfully at ${completionString}`,
                    type: "success"
                  });

                  setCurrentPage(5); // Go to success page
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
              }}
            >
              Submit Order
            </Button>
            <Button variant="secondary" onClick={saveDraft}>
              Save as Draft
            </Button>
          </ButtonRow>
        </>
      )}
    </>
  );
};

export default ReviewSubmit;
