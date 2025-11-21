import { useState } from "react";
import { Button, Text, Flex, hubspot } from "@hubspot/ui-extensions";

// SHAPE: Input → Filter → Transform → Store → Output → Loop
// INPUT: fullOrder, parsedOrder
// FILTER: ensure required fields exist, sanitize values
// TRANSFORM: map HubSpot order shape → ABC payload
// STORE: payload handed to serverless function
// OUTPUT: sandbox API response
// LOOP: user can re-run as order changes

const DEFAULT_BRANCH = "461";
const DEFAULT_ACCOUNT = "2063975-2";

function nonEmpty(value) {
  return !!(value && String(value).trim().length > 0);
}

function take(value, max) {
  return (value || "").toString().slice(0, max);
}

function stripNonDigits(value) {
  return (value || "").replace(/\D+/g, "");
}

function formatDateForABC(dateValue) {
  if (!dateValue) return "";
  const str = String(dateValue).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const date = new Date(str);
  if (!isNaN(date.getTime())) {
    return date.toISOString().slice(0, 10);
  }
  return "";
}

const ABCSandboxOrder = ({ fullOrder, parsedOrder }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const getLineItems = () => {
    const source =
      (Array.isArray(fullOrder?.lineItems) && fullOrder.lineItems.length
        ? fullOrder.lineItems
        : fullOrder?.fullOrderItems) || [];

    return source
      .map((item, index) => {
        const sku = item?.itemCode || item?.sku || item?.itemNumber || "";
        const qty = Number(item?.qty ?? item?.quantity ?? 0);
        const price = Number(item?.unitPrice ?? item?.price ?? 0);
        if (!sku || !Number.isFinite(qty) || qty <= 0) {
          return null;
        }
        return {
          id: String(item?.id ?? index + 1),
          itemNumber: sku,
          itemDescription:
            item?.desc || item?.description || item?.itemDescription || "",
          orderedQty: { value: qty, uom: item?.uom || "EA" },
          unitPrice: {
            value: Number.isFinite(price) ? price : 0,
            uom: item?.uom || "EA",
            instructions: "",
          },
        };
      })
      .filter(Boolean);
  };

  const formatABCOrder = () => {
    const lines = getLineItems();
    if (!lines.length) {
      throw new Error("At least one valid line item is required.");
    }

    const delivery = fullOrder?.delivery || {};
    const contact = delivery?.contact || fullOrder?.contact || {};
    const shipToAddress = delivery?.address || delivery;

    // Format delivery date
    const deliveryDate = formatDateForABC(
      delivery?.delivery_date?.formattedDate ||
      delivery?.delivery_date ||
      fullOrder?.requestedDate ||
      parsedOrder?.requestedDate
    );

    // Map time window codes
    const timeCodeMap = {
      anytime: "AT",
      am: "AM",
      pm: "PM",
      morning: "AM",
      afternoon: "PM",
    };
    const timeCode = timeCodeMap[delivery?.time_code?.toLowerCase()] || "AT";

    return [
      {
        requestId:
          fullOrder?.requestId ||
          parsedOrder?.requestId ||
          `req-${Date.now()}`,
        purchaseOrder: take(fullOrder?.poNumber || "N/A", 20),
        branchNumber:
          fullOrder?.branchId ||
          parsedOrder?.branchId ||
          delivery?.branchId ||
          DEFAULT_BRANCH,
        deliveryService: "OTG",
        typeCode: "SO",
        dates: deliveryDate
          ? {
              deliveryRequestedFor: deliveryDate,
            }
          : undefined,
        deliveryAppointment: {
          instructionsTypeCode: timeCode,
          instructions: take(delivery?.delivery_instructions || "", 255),
          fromTime: delivery?.delivery_start_time?.replace(/\s/g, "") || "08:00",
          toTime: delivery?.delivery_end_time || "17:00",
          timeZoneCode: "CT",
        },
        currency: "USD",
        shipTo: {
          name:
            delivery?.jobName ||
            fullOrder?.jobName ||
            delivery?.site_name ||
            "",
          number: fullOrder?.accountNumber || parsedOrder?.accountNumber || DEFAULT_ACCOUNT,
          address: {
            line1: shipToAddress?.address1 || shipToAddress?.address_line_1 || "",
            line2: shipToAddress?.address2 || shipToAddress?.address_line_2 || "",
            line3: shipToAddress?.address3 || shipToAddress?.address_line_3 || "",
            city: shipToAddress?.city || "",
            state: shipToAddress?.state || "",
            postal: shipToAddress?.postalCode || shipToAddress?.zip_code || "",
            country: shipToAddress?.country || "USA",
          },
          contacts: nonEmpty(contact?.email)
            ? [
                {
                  name: contact?.name || delivery?.primary_contact || "",
                  functionCode: "SM",
                  email: contact?.email || "",
                  phones: [
                    {
                      number: stripNonDigits(
                        contact?.phone || delivery?.primary_contact_phone || ""
                      ),
                      type: "MOBILE",
                      ext: "",
                    },
                  ],
                },
              ]
            : [],
        },
        orderComments: nonEmpty(delivery?.delivery_instructions)
          ? [
              {
                code: "H",
                description: take(delivery.delivery_instructions, 255),
              },
            ]
          : [],
        lines,
      },
    ];
  };

  const placeABCSandboxOrder = async () => {
    try {
      if (!fullOrder || Object.keys(fullOrder || {}).length === 0) {
        throw new Error("No active order found. Start an order first.");
      }

      setIsSubmitting(true);
      setError("");
      setResult(null);

      const payload = formatABCOrder();

      const response = await hubspot.serverless("abcOrderSandbox", {
        parameters: {
          orderBody: payload,
        },
      });
      console.log("ABC Sandbox Order Response:", response);
      setResult(response);
    } catch (err) {
      console.error("ABC Sandbox order failed:", err);
      setError(err?.message || "Failed to place ABC sandbox order.");
    } finally {
      setIsSubmitting(false);
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
      </Flex>
    </>
  );
};

export default ABCSandboxOrder;

