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
          />
        );
      case 5:
        return (
          <OrderSuccessPage
            title="Order Success"
            setOrderPage={setOrderPage}
            orderPage={orderPage}
            continueText="Back to Order Start"
          />
        );
      case 6:
        return (
          <OrderTest />
        );
    }
  };

  const [orderPage, setOrderPage] = useState(6);
  const [orderedLineItems, setOrderedLineItems] = useState([]);
  const [fullOrder, setFullOrder] = useState({});
  const [parsedOrder, setParsedOrder] = useState(null);
  const [orderStatus, setOrderStatus] = useState({});
  const pricingGuardRef = useRef(null);

  useEffect(() => {
    parseSelectedOrder(fullOrder.selectedOrder);
  }, [fullOrder.selectedOrder]);

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
    setFullOrder({});
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
          disabled={orderPage === 4}
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
