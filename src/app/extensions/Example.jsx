import React, { useState, useEffect, useRef } from "react";
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
import { prefillDeliveryAddress } from "./helperFunctions/prefillDeliveryAddress";

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

// Define the Extension component, taking in runServerless, context, & sendAlert as props
const PRIMARY_FLOW_PAGES = [0, 1, 2, 3, 4];

const Extension = ({
  sendAlert,
  runServerless,
  context,
  fetchCrmObjectProperties,
}) => {
  const renderPage = (n) => {
    switch (n) {
      case 0:
        return (
          <OrderStart
            setFullOrder={setFullOrder}
            fullOrder={fullOrder}
            context={context}
            runServerless={runServerless}
            setTagStatus={setTagStatus}
            clearOrder={clearOrder}
            setOrderPage={setOrderPage}
            setNextButtonDisabled={setNextButtonDisabled}
          />
        );
      case 1:
        return (
          <PickSetup
            runServerless={runServerless}
            context={context}
            setFullOrder={setFullOrder}
            fullOrder={fullOrder}
            parsedOrder={parsedOrder}
            setNextButtonDisabled={setNextButtonDisabled}
          />
        );
      case 2:
        return (
          <PricingTable
            orderedLineItems={orderedLineItems}
            setOrderedLineItems={setOrderedLineItems}
            setFullOrder={setFullOrder}
            fullOrder={fullOrder}
            runServerless={runServerless}
            parsedOrder={parsedOrder}
            registerPricingGuard={(fn) => {
              pricingGuardRef.current = fn || null;
            }}
            setNextButtonDisabled={setNextButtonDisabled}
          />
        );
      case 3:
        return (
          <DeliveryForm
            fullOrder={fullOrder}
            setFullOrder={setFullOrder}
            runServerless={runServerless}
            parsedOrder={parsedOrder}
            clearOrder={clearOrder}
            setNextButtonDisabled={setNextButtonDisabled}
          />
        );
      case 4:
        return (
          <ReviewSubmit
            fullOrder={fullOrder}
            setFullOrder={setFullOrder}
            context={context}
            fetchCrmObjectProperties={fetchCrmObjectProperties}
            runServerless={runServerless}
            parsedOrder={parsedOrder}
            tagStatus={orderStatus.text}
            sendAlert={sendAlert}
            setOrderPage={setOrderPage}
            setNextButtonDisabled={setNextButtonDisabled}
          />
        );
      case 5:
        return (
          <OrderSuccessPage
            title="Order Success"
            setOrderPage={setOrderPage}
            orderPage={orderPage}
            continueText="Back to Order Start"
            setNextButtonDisabled={setNextButtonDisabled}
          />
        );
      case 6:
        return (
          <OrderTest
            fullOrder={fullOrder}
            parsedOrder={parsedOrder}
          />
        );
      case 7:
        return (
          <LoginTesting
            fullOrder={fullOrder}
            parsedOrder={parsedOrder}
          />
        );
      case 8:
        return (
          <ABCSandboxOrder
            fullOrder={fullOrder}
            parsedOrder={parsedOrder}
          />
        );
    }
  };

  const [orderPage, setOrderPage] = useState(0);
  const [orderedLineItems, setOrderedLineItems] = useState([]);
  const [fullOrder, setFullOrder] = useState({});
  const [parsedOrder, setParsedOrder] = useState(null);
  const [orderStatus, setOrderStatus] = useState({});
  const [NextButtonDisabled, setNextButtonDisabled] = useState(false);
  const pricingGuardRef = useRef(null);
  const dealAddressRef = useRef({});
  const addressPrefillAppliedRef = useRef(false);


  useEffect(() => {
    parseSelectedOrder(fullOrder.selectedOrder);
  }, [fullOrder.selectedOrder]);

  useEffect(() => {
    let cancelled = false;

    async function loadDealAddressDefaults() {
      try {
        const properties =
          (await fetchCrmObjectProperties([
            "address_line_1",
            "city",
            "state",
            "zip_code",
          ])) || {};

        if (cancelled) return;
        dealAddressRef.current = properties;
        setFullOrder((prev) => {
          const currentDelivery = prev.delivery || {};
          const { delivery: mergedDelivery, touched } = prefillDeliveryAddress({
            delivery: currentDelivery,
            crm: properties,
          });

          if (!touched) return prev;
          return {
            ...prev,
            delivery: mergedDelivery,
          };
        });
        console.log("fullOrder: ", properties);
        setFullOrder((prev) => ({ ...prev, address: properties }));
      } catch (error) {
        console.error("Failed to prefill delivery address", error);
      } finally {
        if (!cancelled) {
          addressPrefillAppliedRef.current = true;
        }
      }
    }

    if (!addressPrefillAppliedRef.current) {
      loadDealAddressDefaults();
    }

    return () => {
      cancelled = true;
    };
  }, [fetchCrmObjectProperties, setFullOrder]);

  const parseSelectedOrder = (selectedOrder) => {
    console.log(
      "fully rendered selectedOrder: ",
      selectedOrder?.value?.properties?.payload_snapshot
    );
    const rawOrder = selectedOrder?.value?.properties?.payload_snapshot;
    if (rawOrder) {
      const parsedOrder = JSON.parse(rawOrder);
      console.log("parsedOrder: ", parsedOrder);
      setParsedOrder(parsedOrder);
      setFullOrder((prev) => {
        const mergedDelivery = mergeDeliverySources({
          parsedDelivery: parsedOrder?.delivery,
          crmDefaults: dealAddressRef.current,
        });

        if (!mergedDelivery) return prev;
        const nextDelivery = JSON.stringify(prev.delivery) === JSON.stringify(mergedDelivery)
          ? prev.delivery
          : mergedDelivery;

        if (nextDelivery === prev.delivery) return prev;

        return {
          ...prev,
          delivery: nextDelivery,
        };
      });
    } else {
      setParsedOrder(null);
    }
  };

  const setTagStatus = (status) => {
    let statusType = "";

    if (status === "Draft") {
      statusType = "warning";
    } else if (status === "Placed") {
      statusType = "default";
    } else if (status === "Submitted") {
      statusType = "success";
    }

    setOrderStatus({
      status: statusType,
      text: status,
    });
  };

  const clearOrder = () => {
    const prefilled = prefillDeliveryAddress({
      delivery: {},
      crm: dealAddressRef.current,
    }).delivery;

    setFullOrder(
      hasAnyValue(prefilled)
        ? {
            delivery: prefilled,
          }
        : {}
    );
    setOrderedLineItems([]);
    setParsedOrder(null);
    setOrderStatus({
      status: "warning",
      text: "Draft",
    });
  };

  // SHAPE: Input → Filter → Transform → Store → Output → Loop
  // INPUT: { fullOrder, context }
  // FILTER: ensure dealId exists
  // TRANSFORM: build order payload from current state
  // STORE: save to HubSpot via serverless function
  // OUTPUT: success/error alert
  // LOOP: safe to call from any page (except review/submit pages)
  const saveDraft = async () => {
    try {
      // Calculate orderTotal if not present
      let orderTotal = fullOrder.orderTotal;
      if (!orderTotal && fullOrder.fullOrderItems) {
        orderTotal = fullOrder.fullOrderItems.reduce(
          (sum, item) => sum + (Number(item.qty) || 0) * (Number(item.unitPrice) || 0),
          0
        );
      }

      const orderPayload = {
        ...fullOrder,
        orderStatus: "Draft",
        ...(orderTotal !== undefined ? { orderTotal: orderTotal } : {}),
      };

      console.log("=== saveDraft DEBUG ===");
      console.log("orderObjectId:", fullOrder.selectedOrderId || fullOrder.orderId);
      console.log("orderPayload keys:", Object.keys(orderPayload));

      const response = await hubspot.serverless("sendDraftToHubspot", {
        parameters: {
          fullOrder: orderPayload,
          dealId: context.crm.objectId,
          orderObjectId:
            fullOrder.selectedOrderId ||
            fullOrder.orderId ||
            null,
        },
      });

      console.log("=== saveDraft RESPONSE ===");
      console.log(JSON.stringify(response, null, 2));

      // Check for errors
      if (response.body?.ok === false || response.statusCode >= 400) {
        const errorMsg = response.body?.error || response.body?.message || "Failed to save draft";
        console.error("❌ Draft save failed:", errorMsg);
        sendAlert({ 
          message: `Failed to save draft: ${errorMsg}`, 
          type: "danger" 
        });
        return;
      }

      const newOrderId = response.body?.orderId;
      if (newOrderId) {
        setFullOrder((prev) => ({
          ...prev,
          orderId: newOrderId,
          selectedOrderId: newOrderId,
          orderStatus: "Draft",
          orderNumber: response.body?.hubspotResponse?.properties?.order_id || prev.orderNumber,
          lastSavedAt: response.body?.hubspotResponse?.properties?.last_saved_at || new Date().toISOString(),
          ...(orderTotal !== undefined ? { orderTotal: orderTotal } : {}),
        }));
        sendAlert({ message: "Order saved as draft", type: "success" });
        setTagStatus("Draft");
      } else {
        console.warn("⚠️ No orderId returned from draft save");
        sendAlert({ 
          message: "Draft save completed but no order ID returned", 
          type: "warning" 
        });
      }
    } catch (error) {
      console.error("❌ Error saving draft:", error);
      sendAlert({ 
        message: `Error saving draft: ${error.message || "Unknown error"}`, 
        type: "danger" 
      });
    }
  };

  {/*
      const TestABCProductsSB = async () => {
    const response = await hubspot.serverless("abcProductsSB");
    console.log("ABC Products from Supabase:", response);
    return response;
  };
  */}

  const currentFlowIndex = PRIMARY_FLOW_PAGES.indexOf(orderPage);
  const isFlowPage = currentFlowIndex !== -1;
  const isLastPrimaryPage =
    isFlowPage && currentFlowIndex === PRIMARY_FLOW_PAGES.length - 1;
  const nextPrimaryPage = isFlowPage
    ? PRIMARY_FLOW_PAGES[Math.min(
        currentFlowIndex + 1,
        PRIMARY_FLOW_PAGES.length - 1
      )]
    : PRIMARY_FLOW_PAGES[0];
  const shouldDisableNext = NextButtonDisabled || !isFlowPage || isLastPrimaryPage;
  
  // Show save draft link on pages 0, 1, 2, 3 (not on 4=reviewSubmit or 5=successPage)
  const showSaveDraftLink = orderPage !== 4 && orderPage !== 5;

  return (
    <>
    {orderPage === 5 ? (
      <>
      <Tag variant="success">Submitted</Tag>
      </>
    ) : (
      <>
      <Tag variant={orderStatus.status}>{orderStatus.text}</Tag>
      </>
    )}
      
      {renderPage(orderPage)}
      <Text></Text>

      {showSaveDraftLink && (
        <Flex justify="end">
          <Button variant="secondary" onClick={saveDraft}>
            Save as Draft
          </Button>
        </Flex>
      )}

      <Divider />
      <Text></Text>
      <ButtonRow>
        {orderPage === 5 ? (
          <>
          <Button onClick={() => setOrderPage(0)}>Back to Order Start</Button>
          </>
        ) : (
        <>
         <Button
          disabled={orderPage === 0}
          onClick={() => {
            // If submitted order, always go back to page 0, otherwise normal flow
            if (fullOrder.selectedOrder?.value?.properties?.status === "Submitted") {
              setOrderPage(0);
            } else {
              setOrderPage(orderPage - 1);
            }
          }}
        >
          Back
        </Button>
        <Button
          variant="primary"
          disabled={shouldDisableNext}
          onClick={async () => {
            if (fullOrder.selectedOrder?.value?.properties?.status === "Submitted") {
              setOrderPage(4);
              return;
            }

            if (orderPage === 2 && pricingGuardRef.current) {
              try {
                await pricingGuardRef.current();
              } catch (error) {
                console.error("Auto pricing failed", error);
                sendAlert(
                  {
                    message: "Unable to refresh pricing.  Please try again.",
                    type: "danger",
                  }
                );
                return;
              }
            }

            if (!shouldDisableNext) {
              setOrderPage(nextPrimaryPage);
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

// SHAPE: Input → Filter → Transform → Store → Output → Loop
// INPUT: { parsedDelivery, crmDefaults }
// FILTER: exit if no parsed delivery present
// TRANSFORM: hydrate parsed delivery with CRM defaults for blank fields
// STORE: return merged delivery object for caller to persist
// OUTPUT: delivery object or null
// LOOP: safe to call whenever a new parsed order arrives
function mergeDeliverySources({ parsedDelivery, crmDefaults }) {
  if (!parsedDelivery) return null;

  const { delivery } = prefillDeliveryAddress({
    delivery: parsedDelivery,
    crm: crmDefaults,
  });

  return delivery || null;
}

function hasAnyValue(obj = {}) {
  return Object.values(obj).some((value) => {
    if (value === null || value === undefined) return false;
    if (typeof value === "string") return value.trim().length > 0;
    return true;
  });
}
