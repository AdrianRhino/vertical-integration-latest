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
import { moneyFormatter } from "../helperFunctions/helper";

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
    const base = parsedOrder || {};
    const mergedDelivery = {
      ...(base.delivery || {}),
      ...(fullOrder.delivery || {}),
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

    return {
      ...base,
      ...fullOrder,
      supplier: fullOrder.supplier || base.supplier || "",
      ticket: fullOrder.ticket || base.ticket || "",
      template: fullOrder.template || base.template || "",
      orderType: fullOrder.orderType || base.orderType || "",
      delivery: mergedDelivery,
      fullOrderItems: mergedItems,
      templateItems: mergedTemplateItems,
      addressSnapshot,
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
    if (parsedOrder && fullOrder.selectedOrderId) {
      // Using existing order - update its status
      setSubmitStatus("Submitted", fullOrder.selectedOrderId);
      sendAlert({ message: "Order updated successfully", type: "success" });
    } else {
      // Creating new order - save then update status
      // Pass false to suppress the "saved as draft" alert since we'll show "Order created successfully" instead
      const newOrderId = await sendDraftToHubspot(false);
      setSubmitStatus("Submitted", newOrderId);
      sendAlert({ message: "Order created successfully", type: "success" });
    }
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
            <Text>{crmProperties.address_line_1}</Text>
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
            <Button variant="primary" onClick={() => {
              sendOrderToHubspot();
              setOrderPage(5);
              }}>
              Submit Order
            </Button>
            <Button variant="secondary" onClick={() => sendDraftToHubspot()}>
              Save as Draft
            </Button>
          </ButtonRow>
          <Button variant="secondary" onClick={() => setOrderPage(6)}>Go to Testing Panel</Button>
        </>
      )}
    </>
  );
};

export default ReviewSubmit;
