import { useState, useEffect } from "react";
import { Button, Text, Flex, hubspot } from "@hubspot/ui-extensions";
import supplierEnvironments from "../config/supplierEnvironments.json";

// SHAPE: Input → Filter → Transform → Store → Output → Loop
// INPUT: fullOrder, parsedOrder
// FILTER: validate order has required fields
// TRANSFORM: convert to unified format, then to ABC format
// STORE: ABC request payload
// OUTPUT: send to sandbox API
// LOOP: display result, allow retry

const ABCSandboxOrder = ({ fullOrder, parsedOrder }) => {

const branchID = "461";
const shipToNumber = "2063975-2";
const requestId = "Test-Order-123";
const purpose = "estimating";
const lines = fullOrder.fullOrderItems.map(item => ({
    id: item.id,
    itemNumber: item.sku,
    quantity: item.qty,
    uom: item.uom,
}));

const formatABCOrder = (order) => {
    return {
        branchID: order.branchID,
        shipToNumber: order.shipToNumber,
        requestId: order.requestId,
        purpose: order.purpose,
        lines: order.lines,
    };
};

const formABCOrder = () => {
    if (fullOrder && parsedOrder) {
        console.log("Full Order:", fullOrder);
        console.log("Parsed Order:", parsedOrder);
        const lines = fullOrder.fullOrderItems.map(item => ({
            id: item.id,
            itemNumber: item.sku,
            quantity: item.qty || 1,
            uom: item.uom || "EA",
        }));
        const abcOrder = formatABCOrder({
            branchID,
            shipToNumber,
            requestId,
            purpose,
            lines,
        });
        console.log("ABC Order:", abcOrder);
    }
};

  return (
    <>
     <Text>ABC Sandbox Order</Text>
     <Button onClick={() => console.log("Order:", fullOrder || parsedOrder || "No order found")}>Test ABC Sandbox Order</Button>
     <Button onClick={() => formABCOrder()}>Form ABC Order</Button>
    </>
  );
};

export default ABCSandboxOrder;

