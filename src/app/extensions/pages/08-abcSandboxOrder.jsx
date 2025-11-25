import { useState } from "react";
import { Button, Text, Flex, hubspot, Divider } from "@hubspot/ui-extensions";
import { inputStage } from "../pipeline/input.js";
import { filterStage } from "../pipeline/filter.js";
import { checkInvariants } from "../invariants/checkInvariants.js";
import { getAdapter } from "../adapters/adapterRegistry.js";
import { logOrderSubmission, logInvariantViolation } from "../utils/logger.js";

// SHAPE: Input → Filter → Transform → Store → Output → Loop
// INPUT: fullOrder, parsedOrder
// FILTER: validate order has required fields
// TRANSFORM: convert to unified format, then to ABC format
// STORE: ABC request payload
// OUTPUT: send to sandbox API
// LOOP: display result, allow retry

const ABCSandboxOrder = ({ fullOrder, parsedOrder }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const placeABCSandboxOrder = async () => {
    try {
      setIsSubmitting(true);
      setError("");
      setResult(null);

      // TEMPORARY: Bypass frontend validation to test hardcoded order in backend
      // The backend has a hardcoded order for format testing
      console.log("=== Bypassing frontend validation - testing hardcoded backend order ===");
      
      // Submit via serverless function (backend will use hardcoded order)
      const response = await hubspot.serverless("abcOrderSandbox", {
        parameters: {
          orderBody: null, // Backend will use hardcoded order
        },
      });

      // TODO: Once hardcoded order works, restore validation below:
      /*
      if (!fullOrder || Object.keys(fullOrder || {}).length === 0) {
        throw new Error("No active order found. Start an order first.");
      }

      // Input stage: Build InternalOrder
      const { order, errors: inputErrors, warnings: inputWarnings } = inputStage(
        fullOrder,
        parsedOrder,
        {}
      );

      if (inputErrors.length > 0) {
        throw new Error(inputErrors.join("\n"));
      }

      // Filter stage: Validate and sanitize
      const { order: filteredOrder, errors: filterErrors, warnings: filterWarnings } = filterStage(order);

      if (filterErrors.length > 0) {
        throw new Error(filterErrors.join("\n"));
      }

      // Check invariants
      const invariantCheck = checkInvariants(filteredOrder, "ABC");
      if (!invariantCheck.valid) {
        const errorMessages = invariantCheck.errors.map(e => e.message).join("\n");
        throw new Error(errorMessages);
      }

      // Get adapter and transform
      const adapter = getAdapter("ABC", "sandbox");
      const payload = adapter.transform(filteredOrder);

      // Submit via serverless function
      const response = await hubspot.serverless("abcOrderSandbox", {
        parameters: {
          orderBody: payload,
        },
      });
      */

      console.log("ABC Sandbox Order Response:", response);
      
      // Log submission (using hardcoded order for now)
      // TODO: Restore filteredOrder logging when validation is re-enabled
      if (fullOrder) {
        logOrderSubmission(fullOrder, "ABC", response);
      }
      
      setResult(response);
    } catch (err) {
      console.error("ABC Sandbox order failed:", err);
      setError(err?.message || "Failed to place ABC sandbox order.");
      
      // Log error
      if (fullOrder) {
        logInvariantViolation(
          fullOrder,
          "ABC",
          { field: "order", message: err.message },
          null,
          null
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const testSRSOrder = async () => {
    try {
      const response = await hubspot.serverless("srsOrderSandbox", {
        parameters: {
          orderBody: null,
        },
      });
      console.log("SRS Sandbox Order Response:", response);
    } catch (err) {
      console.error("SRS Sandbox order failed:", err);
      setError(err?.message || "Failed to place SRS sandbox order.");
    }
  };

  return (
    <>
      <Text>ABC Sandbox Order</Text>
      <Flex direction="column" gap="small">
        <Button
          disabled={isSubmitting}
          onClick={placeABCSandboxOrder}
        >
          {isSubmitting ? "Submitting..." : "Place ABC Sandbox Order"}
        </Button>
        {error && (
          <Text style={{ color: "#c0392b" }}>Error: {error}</Text>
        )}
        {result && (
          <Text
            variant="microcopy"
            style={{ fontFamily: "monospace", whiteSpace: "pre-wrap" }}
          >
            {JSON.stringify(result, null, 2)}
          </Text>
        )}

        <Divider />

        <Button onClick={testSRSOrder}>Test SRS Sandbox Order</Button>
      </Flex>
    </>
  );
};

export default ABCSandboxOrder;

