import { useState, useEffect } from "react";
import { Text, Select, Alert } from "@hubspot/ui-extensions";
import { hubspot } from "@hubspot/ui-extensions";
import { appOptions } from "../helperFunctions/appOptions";
import { parseLineItemsFromString } from "../helperFunctions/helper";

const OrderStart = ({ setFullOrder, fullOrder, context, setTagStatus, clearOrder, setOrderPage, setNextButtonDisabled }) => {
  const [chosenAppOption, setChosenAppOption] = useState(null);
  const [allOrders, setAllOrders] = useState([]);
  const [orderOptions, setOrderOptions] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showAlert, setShowAlert] = useState(false); // move to state above

useEffect(() => {
  if (!chosenAppOption || chosenAppOption === "New Order") {
    return;
  }

  getAllOrders();
}, [chosenAppOption]);

  useEffect(() => {
    // Filter orders based on selected option
    const filteredOrders = allOrders.filter((order) => {
      const status = order.value.properties.status;
      if (chosenAppOption === "Draft Order") return status === "Draft";
      if (chosenAppOption === "Submitted Order") {
       // setOrderPage(4);
        return status === "Submitted";
      } 
      return false;
    });

    setOrderOptions(
      filteredOrders.map((order) => ({
        label: `${order.value.properties.status} Order - ${order.value.properties.order_id || order.value.id}`,
        value: order.value.id,
      }))
    );
  }, [allOrders, chosenAppOption]);

  useEffect(() => {
    console.log("This is the selectedOrder", selectedOrder?.value?.properties?.status);
    setTagStatus(selectedOrder?.value?.properties?.status || "Draft");
  }, [selectedOrder]);


    useEffect(() => {
      if (fullOrder.selectedOrder) {
        console.log("Print raw selected order string")
        const str = fullOrder?.selectedOrder?.value?.properties?.payload_snapshot;
        console.log("🔍 Payload snapshot:", str);
        const lines = parseLineItemsFromString(str);
        console.log("📋 Parsed lines:", lines);
        setFullOrder((prev) => ({ ...prev, selectedOrderItems: lines.lines }));
      }
    }, [fullOrder.selectedOrder])


  const getAllOrders = async () => {
    try {
      console.log("getAllOrders");
      const response = await hubspot.serverless("getDraftOrders", {
        parameters: {
          context: context,
          // Get all orders, we'll filter by status in the UI
        },
      });
      console.log("response", response);
      setAllOrders(response.body.orders);
    } catch (error) {
      console.error("❌ Error getting orders:", error);
    }
  };

useEffect(() => {
  if (fullOrder.selectedOrderId) {
    console.log('current order', allOrders.find((order) => order.value.id === fullOrder.selectedOrderId));
    const currentOrder = allOrders.find((order) => order.value.id === fullOrder.selectedOrderId);
    setTagStatus(currentOrder?.value?.properties?.status);
  } else {
    setTagStatus("Draft");
  }
}, [fullOrder.selectedOrderId, allOrders]);

useEffect(() => {
  if (chosenAppOption === "New Order") {
    setNextButtonDisabled(false);
    return;
  }

  if (chosenAppOption && fullOrder.selectedOrderId) {
    setNextButtonDisabled(false);
  } else {
    setNextButtonDisabled(true);
  }
}, [chosenAppOption, fullOrder.selectedOrderId, setNextButtonDisabled]);

  return (
    <>
      <Text></Text>
      {showAlert && (
        <Alert title="Error" variant="danger">
          We've identified the issue that's causing multiple apps to be unavailable for some customers. We are working with our cloud platform partner, AWS, to resolve the issue.
        </Alert>
      )}
      <Text></Text>
      <Select
        label="Create New Order"
        options={appOptions}
        value={fullOrder.orderType}
        onChange={(value) => {
          setChosenAppOption(value);
          setSelectedOrder(null);
          setOrderOptions([]);
          if (value === "New Order") {
            clearOrder();
            setFullOrder((prev) => ({ ...prev, orderType: value }));
            return;
          }

          setAllOrders([]);
          setFullOrder((prev) => ({
            ...prev,
            orderType: value,
            selectedOrderId: null,
            selectedOrder: null,
            selectedOrderItems: [],
          }));
          setNextButtonDisabled(true);
        }}
      />
      <Text></Text>
      {(chosenAppOption === "Draft Order" || chosenAppOption === "Submitted Order") && (
        <Select
          label={`${chosenAppOption} List`}
          options={orderOptions}
          value={fullOrder.selectedOrderId || undefined}
          onChange={(value) => {
            const order = allOrders.find((order) => order.value.id === value);
            setSelectedOrder(order);
            setFullOrder((prev) => ({
              ...prev,
              selectedOrderId: value,
              selectedOrder: order,
            }));
          }}
        />
      )}
    </>
  );
};

export default OrderStart;
