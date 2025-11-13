import React, { useState, useEffect, useRef } from "react";
import {
  Text,
  Button,
  ButtonRow,
  Tag,
  Divider,
  hubspot,
} from "@hubspot/ui-extensions";

import OrderStart from "./pages/00-orderStart";
import PickSetup from "./pages/01-pickupSetup";
import PricingTable from "./pages/02-pricingTable";
import DeliveryForm from "./pages/03-deliveryForm";
import ReviewSubmit from "./pages/04-reviewSubmit";
import OrderSuccessPage from "./pages/05-successPage";
import OrderTest from "./pages/06-orderTesting";
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

  {/*
      const TestABCProductsSB = async () => {
    const response = await hubspot.serverless("abcProductsSB");
    console.log("ABC Products from Supabase:", response);
    return response;
  };
  */}

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
          disabled={orderPage === 4 || NextButtonDisabled}
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
                    message: "Unable to refresh pricing. Please try again.",
                    type: "danger",
                  }
                );
                return;
              }
            }

            setOrderPage(orderPage + 1);
          }}
        >
          Next
        </Button>
        </>
      )}       
      </ButtonRow>
      <Text></Text>     
    </>
  );
};

export default Extension;

function hasAnyValue(obj = {}) {
  return Object.values(obj).some((value) => {
    if (value === null || value === undefined) return false;
    if (typeof value === "string") return value.trim().length > 0;
    return true;
  });
}
