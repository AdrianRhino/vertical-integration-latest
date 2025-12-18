import React, { useState, useEffect } from "react";
import {
  Text,
  Button,
  ButtonRow,
  Tag,
  Divider,
  Flex,
  hubspot,
} from "@hubspot/ui-extensions";

import OrderStart from "./pages/00-orderStart";
import PickSetup from "./pages/01-pickupSetup";
import PricingTable from "./pages/02-pricingTable";
import DeliveryForm from "./pages/03-deliveryForm";
import ReviewSubmit from "./pages/04-reviewSubmit";
import OrderSuccessPage from "./pages/05-successPage";
import OrderTest from "./pages/06-orderTesting";
import LoginTesting from "./pages/07-loginTesting";
import ABCSandboxOrder from "./pages/08-abcSandboxOrder";

// Define the extension to be run within the HubSpot CRM
hubspot.extend(({ context, runServerlessFunction, actions }) => {
  return (
    <Extension
      context={context}
      runServerless={runServerlessFunction}
      sendAlert={actions.addAlert}
      fetchCrmObjectProperties={actions.fetchCrmObjectProperties}
      refreshObjectProperties={actions.refreshObjectProperties}
    />
  );
});

// Simple page numbers - just a list
const MAIN_PAGES = [0, 1, 2, 3, 4];

const Extension = ({
  sendAlert,
  runServerless,
  context,
  fetchCrmObjectProperties,
}) => {
  // Simple state - just one order object (like a list of key-value pairs)
  const [order, setOrder] = useState({
    // Basic info
    supplier: "",
    ticket: "",
    template: "",
    orderType: "",
    // Items (just an array)
    items: [],
    // Delivery (just an object with fields)
    delivery: {},
    // Status
    status: "Draft",
    // IDs
    orderId: "",
    selectedOrderId: "",
    // Other
    selectedOrder: null,
  });

  // Simple page number
  const [currentPage, setCurrentPage] = useState(0);
  const [canGoNext, setCanGoNext] = useState(false);

  // Load address from deal when page loads
  useEffect(() => {
    async function loadAddress() {
      try {
        const properties = await fetchCrmObjectProperties([
          "address_line_1",
          "city",
          "state",
          "zip_code",
        ]);

        // If order doesn't have address yet, use deal address
        if (!order.delivery.address_line_1 && properties.address_line_1) {
          setOrder((prev) => ({
            ...prev,
            delivery: {
              ...prev.delivery,
              address_line_1: properties.address_line_1 || "",
              city: properties.city || "",
              state: properties.state || "",
              zip_code: properties.zip_code || "",
            },
          }));
        }
      } catch (error) {
        console.error("Failed to load address", error);
      }
    }
    loadAddress();
  }, []);

  // Load draft order if one is selected
  useEffect(() => {
    if (order.selectedOrder) {
      const orderData = order.selectedOrder.value?.properties?.payload_snapshot;
      if (orderData) {
        try {
          const loadedOrder = JSON.parse(orderData);
          // Simple: just copy the loaded order data
          // Handle both fullOrderItems (from draft) and items (current format)
          const loadedItems = loadedOrder.fullOrderItems || loadedOrder.items || [];
          setOrder((prev) => ({
            ...prev,
            supplier: loadedOrder.supplier || prev.supplier,
            ticket: loadedOrder.ticket || prev.ticket,
            template: loadedOrder.template || prev.template,
            items: loadedItems,
            delivery: loadedOrder.delivery || prev.delivery,
            status: loadedOrder.orderStatus || loadedOrder.status || "Draft",
            orderId: loadedOrder.orderId || prev.orderId,
            selectedOrderId: loadedOrder.orderId || loadedOrder.selectedOrderId || prev.selectedOrderId,
          }));
        } catch (error) {
          console.error("Failed to parse order", error);
        }
      }
    }
  }, [order.selectedOrder]);

  // Simple function to show which page
  const showPage = (pageNumber) => {
    switch (pageNumber) {
      case 0:
        return (
          <OrderStart
            order={order}
            setOrder={setOrder}
            context={context}
            runServerless={runServerless}
            setStatus={setStatus}
            clearOrder={clearOrder}
            setCurrentPage={setCurrentPage}
            setCanGoNext={setCanGoNext}
          />
        );
      case 1:
        return (
          <PickSetup
            order={order}
            setOrder={setOrder}
            context={context}
            runServerless={runServerless}
            setCanGoNext={setCanGoNext}
          />
        );
      case 2:
        return (
          <PricingTable
            order={order}
            setOrder={setOrder}
            runServerless={runServerless}
            setCanGoNext={setCanGoNext}
          />
        );
      case 3:
        return (
          <DeliveryForm
            order={order}
            setOrder={setOrder}
            runServerless={runServerless}
            setCanGoNext={setCanGoNext}
          />
        );
      case 4:
        return (
          <ReviewSubmit
            order={order}
            setOrder={setOrder}
            context={context}
            fetchCrmObjectProperties={fetchCrmObjectProperties}
            runServerless={runServerless}
            sendAlert={sendAlert}
            setCurrentPage={setCurrentPage}
            setCanGoNext={setCanGoNext}
          />
        );
      case 5:
        return (
          <OrderSuccessPage
            title="Order Success"
            setCurrentPage={setCurrentPage}
            currentPage={currentPage}
            continueText="Back to Order Start"
            setCanGoNext={setCanGoNext}
          />
        );
      case 6:
        return <OrderTest order={order} />;
      case 7:
        return <LoginTesting order={order} />;
      case 8:
        return <ABCSandboxOrder order={order} />;
      default:
        return <Text>Page not found</Text>;
    }
  };

  // Simple function to set status tag
  const [statusTag, setStatusTag] = useState({ type: "warning", text: "Draft" });
  const setStatus = (statusText) => {
    let tagType = "warning";
    if (statusText === "Submitted") {
      tagType = "success";
    } else if (statusText === "Placed") {
      tagType = "default";
    }
    setStatusTag({ type: tagType, text: statusText });
  };

  // Simple function to clear order
  const clearOrder = () => {
    setOrder({
      supplier: "",
      ticket: "",
      template: "",
      orderType: "",
      items: [],
      delivery: {},
      status: "Draft",
      orderId: "",
      selectedOrderId: "",
      selectedOrder: null,
    });
    setStatus("Draft");
  };

  // Simple function to save draft
  const saveDraft = async () => {
    try {
      // Calculate total from items (simple loop)
      let total = 0;
      for (let i = 0; i < order.items.length; i++) {
        const item = order.items[i];
        const qty = Number(item.qty) || 0;
        const price = Number(item.unitPrice) || 0;
        total = total + qty * price;
      }

      // Build simple order object (convert items to fullOrderItems for serverless function)
      const orderToSave = {
        ...order,
        fullOrderItems: order.items, // Serverless function expects fullOrderItems
        orderStatus: "Draft",
        orderTotal: total,
      };

      const response = await hubspot.serverless("sendDraftToHubspot", {
        parameters: {
          fullOrder: orderToSave,
          dealId: context.crm.objectId,
          orderObjectId: order.orderId || order.selectedOrderId || null,
        },
      });

      if (response.body?.ok === false || response.statusCode >= 400) {
        const errorMsg = response.body?.error || response.body?.message || "Failed to save draft";
        sendAlert({ message: `Failed to save draft: ${errorMsg}`, type: "danger" });
        return;
      }

      const newOrderId = response.body?.orderId;
      if (newOrderId) {
        setOrder((prev) => ({
          ...prev,
          orderId: newOrderId,
          selectedOrderId: newOrderId,
          orderStatus: "Draft",
        }));
        sendAlert({ message: "Order saved as draft", type: "success" });
        setStatus("Draft");
      } else {
        sendAlert({ message: "Draft saved but no order ID returned", type: "warning" });
      }
    } catch (error) {
      console.error("Error saving draft:", error);
      sendAlert({ message: `Error saving draft: ${error.message || "Unknown error"}`, type: "danger" });
    }
  };

  // Simple: show save draft button on pages 0, 1, 2, 3 (not on review page 4 or success page 5)
  const showSaveButton = currentPage !== 4 && currentPage !== 5;

  // Simple: check if we can go to next page
  const isLastPage = currentPage === 4;
  const canGoToNext = canGoNext && !isLastPage && MAIN_PAGES.includes(currentPage);

  return (
    <>
      {currentPage === 5 ? (
        <Tag variant="success">Submitted</Tag>
      ) : (
        <Tag variant={statusTag.type}>{statusTag.text}</Tag>
      )}

      {showPage(currentPage)}
      <Text></Text>

      {showSaveButton && (
        <Flex justify="end">
          <Button variant="secondary" onClick={saveDraft}>
            Save as Draft
          </Button>
        </Flex>
      )}

      <Divider />
      <Text></Text>
      <ButtonRow>
        {currentPage === 5 ? (
          <Button onClick={() => setCurrentPage(0)}>Back to Order Start</Button>
        ) : (
          <>
            <Button
              disabled={currentPage === 0}
              onClick={() => {
                if (order.selectedOrder?.value?.properties?.status === "Submitted") {
                  setCurrentPage(0);
                } else {
                  setCurrentPage(currentPage - 1);
                }
              }}
            >
              Back
            </Button>
            <Button
              variant="primary"
              disabled={!canGoToNext}
              onClick={() => {
                if (order.selectedOrder?.value?.properties?.status === "Submitted") {
                  setCurrentPage(4);
                  return;
                }
                if (!isLastPage) {
                  setCurrentPage(currentPage + 1);
                }
              }}
            >
              Next
            </Button>
          </>
        )}
      </ButtonRow>
      <Text></Text>
      <Text></Text>
    </>
  );
};

export default Extension;
