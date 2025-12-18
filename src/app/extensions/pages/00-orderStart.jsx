import { useState, useEffect } from "react";
import { Text, Select } from "@hubspot/ui-extensions";
import { hubspot } from "@hubspot/ui-extensions";
import { appOptions } from "../helperFunctions/appOptions";

const OrderStart = ({ order, setOrder, context, setStatus, clearOrder, setCurrentPage, setCanGoNext }) => {
  const [allOrders, setAllOrders] = useState([]);
  const [orderOptions, setOrderOptions] = useState([]);
  const [selectedOption, setSelectedOption] = useState(null);

  // Load all orders when user selects "Draft Order" or "Submitted Order"
  useEffect(() => {
    if (selectedOption === "Draft Order" || selectedOption === "Submitted Order") {
      loadAllOrders();
    }
  }, [selectedOption]);

  // Filter orders into a simple list
  useEffect(() => {
    if (allOrders.length === 0) {
      setOrderOptions([]);
      return;
    }

    // Simple filter: just check status
    const filtered = [];
    for (let i = 0; i < allOrders.length; i++) {
      const orderItem = allOrders[i];
      const status = orderItem.value.properties.status;
      
      if (selectedOption === "Draft Order" && status === "Draft") {
        filtered.push(orderItem);
      } else if (selectedOption === "Submitted Order" && status === "Submitted") {
        filtered.push(orderItem);
      }
    }

    // Convert to simple options list
    const options = [];
    for (let i = 0; i < filtered.length; i++) {
      const orderItem = filtered[i];
      options.push({
        label: `${orderItem.value.properties.status} Order - ${orderItem.value.properties.order_id || orderItem.value.id}`,
        value: orderItem.value.id,
      });
    }
    setOrderOptions(options);
  }, [allOrders, selectedOption]);

  // Update status tag when order is selected
  useEffect(() => {
    if (order.selectedOrder) {
      const status = order.selectedOrder.value?.properties?.status || "Draft";
      setStatus(status);
    } else {
      setStatus("Draft");
    }
  }, [order.selectedOrder]);

  // Simple function to load all orders
  const loadAllOrders = async () => {
    try {
      const response = await hubspot.serverless("getDraftOrders", {
        parameters: { context: context },
      });
      setAllOrders(response.body.orders || []);
    } catch (error) {
      console.error("Error getting orders:", error);
    }
  };

  // Enable next button
  useEffect(() => {
    if (selectedOption === "New Order") {
      setCanGoNext(true);
    } else if (selectedOption && order.selectedOrderId) {
      setCanGoNext(true);
    } else {
      setCanGoNext(false);
    }
  }, [selectedOption, order.selectedOrderId]);

  return (
    <>
      <Text></Text>
      <Select
        label="Create New Order"
        options={appOptions}
        value={order.orderType}
        onChange={(value) => {
          setSelectedOption(value);
          if (value === "New Order") {
            clearOrder();
            setOrder((prev) => ({ ...prev, orderType: value }));
            return;
          }

          // Clear selection when switching
          setAllOrders([]);
          setOrder((prev) => ({
            ...prev,
            orderType: value,
            selectedOrderId: "",
            selectedOrder: null,
          }));
          setCanGoNext(false);
        }}
      />
      <Text></Text>
      {(selectedOption === "Draft Order" || selectedOption === "Submitted Order") && (
        <Select
          label={`${selectedOption} List`}
          options={orderOptions}
          value={order.selectedOrderId || undefined}
          onChange={(value) => {
            // Find the selected order from the list
            let foundOrder = null;
            for (let i = 0; i < allOrders.length; i++) {
              if (allOrders[i].value.id === value) {
                foundOrder = allOrders[i];
                break;
              }
            }

            setOrder((prev) => ({
              ...prev,
              selectedOrderId: value,
              selectedOrder: foundOrder,
            }));
          }}
        />
      )}
    </>
  );
};

export default OrderStart;
