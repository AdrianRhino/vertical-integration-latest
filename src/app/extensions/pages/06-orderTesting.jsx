import { useMemo, useState } from "react";
import {
  Button,
  Flex,
  Panel,
  PanelBody,
  PanelSection,
  Text,
} from "@hubspot/ui-extensions";
import unifiedConfig from "../config/unifiedOrderConfig.json";

// UnifiedOrder (simple shape)
// Required: accountNumber, branchId, fulfillmentMethod, lineItems[]
// Optional: jobName, jobNumber, poNumber, poNote, requestedDate (YYYY-MM-DD),
// timeWindow ('ANYTIME'|'MORNING'|'AFTERNOON'|'SPECIAL'|'EXACT'|'RANGE'),
// exactFrom ('HH:MM'), exactTo ('HH:MM'), shipTo (address object),
// contact (name/phone/email/ccEmails[]), notes, payment (for Beacon only), flags
function makeUnifiedOrder(partial = {}) {
  return {
    target: partial.target ?? "ABC",
    accountNumber: partial.accountNumber ?? "",
    branchId: partial.branchId ?? "",
    sellingBranchId: partial.sellingBranchId ?? "",
    jobName: partial.jobName ?? "",
    jobNumber: partial.jobNumber ?? "",
    poNumber: partial.poNumber ?? "",
    poNote: partial.poNote ?? "",
    requestedDate: partial.requestedDate ?? "",
    timeWindow: partial.timeWindow ?? "ANYTIME",
    exactFrom: partial.exactFrom ?? "",
    exactTo: partial.exactTo ?? "",
    fulfillmentMethod: partial.fulfillmentMethod ?? "DELIVERY_GROUND",
    shipTo: partial.shipTo ?? {
      name: "",
      address1: "",
      address2: "",
      address3: "",
      city: "",
      state: "",
      postalCode: "",
      country: "USA",
    },
    contact: partial.contact ?? {
      name: "",
      phone: "",
      email: "",
      ccEmails: [],
      address: { address1: "", city: "", state: "", postalCode: "" },
    },
    lineItems: Array.isArray(partial.lineItems) ? partial.lineItems : [],
    notes: partial.notes ?? "",
    checkAvailability: partial.checkAvailability ?? true,
    holdOrder: partial.holdOrder ?? false,
    payment: partial.payment ?? null,
    requestId: partial.requestId ?? "",
  };
}

const DeliveryMap = {
  ABC: {
    PICKUP_BRANCH: "CPU",
    DELIVERY_GROUND: "OTG",
    DELIVERY_ROOF: "OTR",
    THIRD_PARTY: "TPC",
  },
  SRS: {
    PICKUP_BRANCH: "Customer Pickup",
    DELIVERY_GROUND: "Ground Drop",
    DELIVERY_ROOF: "Rooftop",
    THIRD_PARTY: "Third-Party Carrier",
  },
  BEACON: {
    PICKUP_BRANCH: "P",
    DELIVERY_GROUND: "D",
    DELIVERY_ROOF: "D",
    THIRD_PARTY: "D",
  },
};

const TimeWindowMap = {
  ABC: {
    ANYTIME: { code: "AT" },
    MORNING: { code: "AM" },
    AFTERNOON: { code: "PM" },
    SPECIAL: { code: "AT" },
    EXACT: { code: "ST" },
    RANGE: { code: "TR" },
  },
  SRS: {
    ANYTIME: "Anytime",
    MORNING: "Morning",
    AFTERNOON: "Afternoon",
    SPECIAL: "Special",
    EXACT: "Special",
    RANGE: "Special",
  },
  BEACON: {
    ANYTIME: "Anytime",
    MORNING: "Morning",
    AFTERNOON: "Afternoon",
    SPECIAL: "Special Request",
    EXACT: "Special Request",
    RANGE: "Special Request",
  },
};

function asYYYYMMDD(value) {
  const normalized = normalizeToISODate(value);
  return normalized || "";
}

function normalizeToISODate(value) {
  if (!value) return "";

  if (value instanceof Date && !isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const raw = String(value).trim();
  if (!raw) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMatch) {
    const [, month, day, year] = slashMatch;
    const normalizedYear =
      year.length === 2 ? `20${year.padStart(2, "0")}` : year.padStart(4, "0");
    return formatDateParts(normalizedYear, month, day);
  }

  const dashMatch = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
  if (dashMatch) {
    const [, month, day, year] = dashMatch;
    const normalizedYear =
      year.length === 2 ? `20${year.padStart(2, "0")}` : year.padStart(4, "0");
    return formatDateParts(normalizedYear, month, day);
  }

  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return "";
}

function formatDateParts(year, month, day) {
  const y = String(year).padStart(4, "0");
  const monthNum = Number(month) || 0;
  const dayNum = Number(day) || 0;
  if (monthNum < 1 || monthNum > 12) return "";
  if (dayNum < 1 || dayNum > 31) return "";
  const m = String(monthNum).padStart(2, "0");
  const d = String(dayNum).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isAddressEmpty(address = {}) {
  return !Object.values(address).some(nonEmpty);
}

function stripNonDigits(value) {
  return (value || "").replace(/\D+/g, "");
}

function nonEmpty(value) {
  return !!(value && String(value).trim().length > 0);
}

function take(value, n) {
  return (value || "").slice(0, n);
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

const Monospace = ({ children }) => (
  <Text style={{ fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
    {children}
  </Text>
);

const HeaderList = ({ headers }) => {
  const headerEntries = useMemo(
    () => (headers ? Object.entries(headers) : []),
    [headers]
  );

  if (!headerEntries.length) {
    return <Text variant="microcopy">None</Text>;
  }

  return (
    <>
      {headerEntries.map(([key, value]) => (
        <Flex key={key} direction="row" gap="xxs" align="start">
          <Text variant="microcopy" style={{ fontWeight: 600 }}>
            {key}:
          </Text>
          <Text variant="microcopy">{String(value)}</Text>
        </Flex>
      ))}
    </>
  );
};

function toABC(order) {
  const ds = DeliveryMap.ABC[order.fulfillmentMethod] || "OTG";
  const appt = TimeWindowMap.ABC[order.timeWindow] || { code: "AT" };

  const lines = order.lineItems.map((item, idx) => {
    const out = {
      id: idx + 1,
      itemNumber: item.itemCode,
      itemDescription: item.desc || "",
      orderedQty: { value: Number(item.qty || 0), uom: item.uom || "EA" },
    };

    if (nonEmpty(item.lineNote)) {
      out.comments = { code: "D", description: take(item.lineNote, 2048) };
    }

    if (item.unitPrice != null) {
      out.unitPrice = {
        value: Number(item.unitPrice),
        uom: item.uom || "EA",
        instructions: "",
      };
    }

    return out;
  });

  const body = {
    requestId: nonEmpty(order.requestId)
      ? order.requestId
      : `req-${Date.now()}`,
    purchaseOrder: take(order.poNumber, 20),
    branchNumber: order.branchId,
    deliveryService: ds,
    typeCode: "SO",
    dates: nonEmpty(order.requestedDate)
      ? { deliveryRequestedFor: asYYYYMMDD(order.requestedDate) }
      : undefined,
    deliveryAppointment: {
      instructionsTypeCode: appt.code,
      instructions: take(order.notes || "", 255),
      fromTime: nonEmpty(order.exactFrom) ? order.exactFrom : undefined,
      toTime: nonEmpty(order.exactTo) ? order.exactTo : undefined,
      timeZoneCode: undefined,
    },
    currency: "USD",
    shipTo: {
      name: order.jobName || order.shipTo.name || "",
      number: order.accountNumber,
      address: {
        line1: order.shipTo.address1 || "",
        line2: order.shipTo.address2 || "",
        line3: order.shipTo.address3 || "",
        city: order.shipTo.city || "",
        state: order.shipTo.state || "",
        postal: order.shipTo.postalCode || "",
        country: order.shipTo.country || "USA",
      },
      contacts: nonEmpty(order.contact?.email)
        ? [
            {
              name: order.contact.name || "",
              functionCode: "SM",
              email: order.contact.email || "",
              phones: [
                {
                  number: stripNonDigits(order.contact.phone || ""),
                  type: "MOBILE",
                  ext: "",
                },
              ],
            },
          ]
        : [],
    },
    orderComments: nonEmpty(order.notes)
      ? [{ code: "H", description: take(order.notes, 255) }]
      : [],
    lines,
  };

  if (isAddressEmpty(body.shipTo.address)) {
    delete body.shipTo.address;
  }

  return {
    url: "https://partners.abcsupply.com/api/order/v2/orders",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify([body]),
  };
}

function toBeacon(order, cfg = { apiSiteId: "WEB" }) {
  const sm = DeliveryMap.BEACON[order.fulfillmentMethod] || "D";
  const pickupTime = TimeWindowMap.BEACON[order.timeWindow] || "Anytime";

  const body = {
    apiSiteId: cfg.apiSiteId,
    accountId: take(order.accountNumber, 6),
    job: {
      jobName: take(order.jobName || "", 15),
      jobNumber: take(order.jobNumber || "", 7),
    },
    purchaseOrderNo: take(order.poNumber || "", 22),
    extendedPO: take(order.poNote || "", 50),
    orderStatusCode: "I",
    lineItems: order.lineItems.map((item) => ({
      itemNumber: item.itemCode,
      quantity: Number(item.qty || 0),
      unitOfMeasure: item.uom || "EA",
      description: take(item.desc || "", 128),
      lineComments: take(item.lineNote || "", 2048),
      productNumber: item.productNumber || item.itemCode,
    })),
    shipping: {
      shippingMethod: take(sm, 1),
      shippingBranch: take(order.branchId || order.sellingBranchId || "", 4),
      address: {
        address1: take(order.shipTo.address1 || "", 30),
        address2: take(order.shipTo.address2 || "", 30),
        city: take(order.shipTo.city || "", 25),
        postalCode: take(order.shipTo.postalCode || "", 10),
        state: take(order.shipTo.state || "", 2),
      },
    },
    payment: order.payment
      ? {
          cardInfo: {
            ExpMM: take(order.payment.expMM || "", 2),
            ExpYY: take(order.payment.expYY || "", 2),
            Type: order.payment.type || "",
            FullName: order.payment.name || "",
          },
          encryptionTokenData: { LowValueToken: order.payment.token || "" },
          addressVerificationData: {
            AVSZIPCode: order.payment.billingZip || "",
          },
        }
      : undefined,
    sellingBranch: take(order.sellingBranchId || order.branchId || "", 4),
    specialInstruction: take(order.notes || "", 234),
    checkForAvailability: order.checkAvailability ? "yes" : "no",
    pickupDate: asYYYYMMDD(order.requestedDate || ""),
    pickupTime,
    onHold: !!order.holdOrder,
    UUID: take(order.requestId || `uuid-${Date.now()}`, 100),
  };

  return {
    url: "/submitOrder",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function toSRS(order, cfg = { sourceSystem: "WEB" }) {
  const srsTime = TimeWindowMap.SRS[order.timeWindow] || "Anytime";
  const contact = order.contact || {};
  const addr = contact.address || {};

  const body = {
    sourceSystem: cfg.sourceSystem,
    customerCode: order.accountNumber,
    accountNumber: order.accountNumber,
    jobAccountNumber: Number(order.jobNumber || 0),
    branchCode: order.branchId,
    transactionID: nonEmpty(order.requestId)
      ? order.requestId
      : `txn-${Date.now()}`,
    transactionDate: new Date().toISOString(),
    notes: order.notes || "",
    shipTo: {
      name: order.jobName || order.shipTo.name || "",
      addressLine1: order.shipTo.address1 || "",
      addressLine2: order.shipTo.address2 || "",
      addressLine3: order.shipTo.address3 || "",
      city: order.shipTo.city || "",
      state: order.shipTo.state || "",
      zipCode: order.shipTo.postalCode || "",
    },
    poDetails: {
      poNumber: order.poNumber || "N/A",
      reference: order.poNote || "",
      jobNumber: order.jobNumber || "",
      orderDate:
        (order.requestedDate && asYYYYMMDD(order.requestedDate)) ||
        new Date().toISOString().slice(0, 10),
      expectedDeliveryDate: asYYYYMMDD(order.requestedDate || ""),
      expectedDeliveryTime: srsTime,
      orderType: "WHSE",
      shippingMethod: DeliveryMap.SRS[order.fulfillmentMethod] || "Ground Drop",
    },
    orderLineItemDetails: order.lineItems.map((item) => ({
      productId: Number(item.productId || 0),
      productName: item.desc || item.itemCode,
      option: item.option || "",
      quantity: Number(item.qty || 0),
      price: Number(Number(item.unitPrice ?? 0).toFixed(0)),
      customerItem: item.itemCode,
      uom: item.uom || "EA",
    })),
    customerContactInfo: {
      customerContactName: contact.name || "",
      customerContactPhone: stripNonDigits(contact.phone || ""),
      customerContactEmail: contact.email || "",
      customerContactAddress: {
        addressLine1: addr.address1 || "",
        city: addr.city || "",
        state: addr.state || "",
        zipCode: addr.postalCode || "",
      },
      additionalContactEmails: ensureArray(contact.ccEmails),
    },
  };

  return {
    url: "/submitOrder",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function buildRequestFromUnified(order, cfg = {}) {
  if (!nonEmpty(order.accountNumber)) throw new Error("accountNumber required");
  if (!nonEmpty(order.branchId)) throw new Error("branchId required");
  if (!Array.isArray(order.lineItems) || order.lineItems.length === 0) {
    throw new Error("at least one line item required");
  }

  if (order.target === "ABC") return toABC(order);
  if (order.target === "BEACON") return toBeacon(order, cfg.beacon);
  if (order.target === "SRS") return toSRS(order, cfg.srs);

  throw new Error("Unknown target");
}

function buildSampleOrder(target) {
  const base = makeUnifiedOrder({
    target,
    accountNumber: "123456",
    branchId: "595",
    sellingBranchId: "595",
    jobName: "Downtown Project",
    jobNumber: "100200",
    poNumber: "PO-78910",
    fulfillmentMethod: "DELIVERY_GROUND",
    requestedDate: "2025-12-15",
    timeWindow: "MORNING",
    shipTo: {
      name: "Downtown Project",
      address1: "123 Main St",
      address2: "Dock 123",
      address3: "",
      city: "Chicago",
      state: "IL",
      postalCode: "60661",
      country: "USA",
    },
    contact: {
      name: "John Doe",
      phone: "888-222-1111",
      email: "john.doe@example.com",
      ccEmails: ["pm@example.com"],
      address: {
        address1: "456 Office Dr",
        city: "Chicago",
        state: "IL",
        postalCode: "60607",
      },
    },
    lineItems: [
      {
        itemCode: "0170030024",
        productId: 170030024,
        qty: 3,
        uom: "CN",
        desc: "Paint Black 12 OZ",
        unitPrice: 7,
        lineNote: "Per spec",
      },
    ],
    notes: "Leave on site",
  });

  if (target === "BEACON") {
    base.payment = {
      expMM: "05",
      expYY: "27",
      type: "MC",
      token: "tok-example",
      billingZip: "60661",
      name: "John Doe",
    };
    base.checkAvailability = true;
  }

  if (target === "SRS") {
    base.requestId = `srs-${Date.now()}`;
  }

  return base;
}

function getNestedValue(obj, path) {
  if (!obj || !path) return undefined;
  const parts = path.split(".");
  let current = obj;
  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
}

function pickFirstValue(paths, ...sources) {
  for (const source of sources) {
    if (!source) continue;
    for (const path of paths) {
      const value = getNestedValue(source, path);
      if (value !== undefined && value !== null && value !== "") {
        return value;
      }
    }
  }
  return undefined;
}

function normalizeDateInput(value) {
  if (!value) return "";
  if (typeof value === "string") {
    if (!value.trim()) return "";
    return value.includes("T") ? value.split("T")[0] : value;
  }
  if (typeof value === "object") {
    if ("formattedDate" in value && value.formattedDate) {
      return normalizeDateInput(value.formattedDate);
    }
    if ("year" in value && "month" in value) {
      const day = value.date ?? value.day ?? 1;
      const date = new Date(value.year, value.month, day);
      return !isNaN(date.getTime()) ? date.toISOString().split("T")[0] : "";
    }
  }
  return "";
}

function normalizeFulfillmentMethod(raw) {
  if (!raw) return "DELIVERY_GROUND";
  const val = String(raw).toLowerCase();
  if (["pickup", "pickup_branch", "cpu", "pick-up"].includes(val)) {
    return "PICKUP_BRANCH";
  }
  if (["roof", "roofdrop", "delivery_roof", "roof_drop", "edge", "edgedrop"].includes(val)) {
    return "DELIVERY_ROOF";
  }
  if (["third_party", "third-party", "3rdparty", "3rd_party", "third"].includes(val)) {
    return "THIRD_PARTY";
  }
  return "DELIVERY_GROUND";
}

function normalizeTimeWindow(raw) {
  if (!raw) return "ANYTIME";
  const val = String(raw).toLowerCase();
  if (["am", "morning"].includes(val)) return "MORNING";
  if (["pm", "afternoon"].includes(val)) return "AFTERNOON";
  if (["special", "special request", "special_request"].includes(val)) return "SPECIAL";
  if (["exact", "specific", "st"].includes(val)) return "EXACT";
  if (["range", "tr"].includes(val)) return "RANGE";
  return "ANYTIME";
}

function coerceBoolean(value, defaultValue = false) {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === "boolean") return value;
  const str = String(value).toLowerCase();
  if (["yes", "true", "1", "y"].includes(str)) return true;
  if (["no", "false", "0", "n"].includes(str)) return false;
  return defaultValue;
}

function normalizeTimeComponent(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value.time) return value.time;
  return "";
}

function buildLineItemsFromOrder(items) {
  const normalized = [];
  const warnings = [];

  ensureArray(items).forEach((item, index) => {
    const itemCode =
      pickFirstValue(
        ["itemCode", "sku", "itemNumber", "itemnumber", "productNumber", "product_number"],
        item
      ) || "";
    const qtyRaw = pickFirstValue(
      ["qty", "quantity", "orderedQty.value", "orderedQty", "quantityOrdered"],
      item
    );
    const qty =
      typeof qtyRaw === "object" && qtyRaw && "value" in qtyRaw
        ? Number(qtyRaw.value)
        : Number(qtyRaw);
    const uom =
      pickFirstValue(
        ["uom", "unitOfMeasure", "orderedQty.uom", "unit_of_measure"],
        item
      ) || "EA";
    if (!itemCode || !Number.isFinite(qty) || qty <= 0) {
      warnings.push(`Line ${index + 1}: missing SKU or quantity`);
      return;
    }

    const unitPriceRaw = pickFirstValue(
      ["unitPrice", "price", "unitPrice.value"],
      item
    );
    const unitPrice =
      unitPriceRaw !== undefined && unitPriceRaw !== null
        ? Number(unitPriceRaw)
        : undefined;

    const normalizedItem = {
      itemCode: String(itemCode),
      qty,
      uom: String(uom || "EA"),
      desc:
        pickFirstValue(
          ["desc", "description", "itemDescription", "title", "name"],
          item
        ) || "",
      option:
        pickFirstValue(["option", "options", "variant"], item) || "",
      unitPrice: Number.isFinite(unitPrice) ? unitPrice : undefined,
      lineNote:
        pickFirstValue(
          ["lineNote", "lineComments", "comments", "comment"],
          item
        ) || "",
      productId: Number(
        pickFirstValue(["productId", "product_id", "familyId", "family_id"], item) || 0
      ),
    };

    normalized.push(normalizedItem);
  });

  return { normalized, warnings };
}

function buildUnifiedFromExisting(fullOrder = {}, parsedOrder = {}) {
  const sources = [fullOrder || {}, parsedOrder || {}];
  const errors = [];
  const warnings = [];

  const supplierRaw =
    pickFirstValue(["supplier", "delivery.supplier", "vendor"], ...sources) || "ABC";
  const target = String(supplierRaw).trim().toUpperCase();
  const supportedTargets = Object.keys(unifiedConfig.suppliers || {});
  if (!supportedTargets.includes(target)) {
    warnings.push(`Supplier "${target}" not recognized, defaulting to ABC.`);
  }
  const finalTarget = supportedTargets.includes(target) ? target : "ABC";

  const supplierConfig = unifiedConfig.suppliers?.[finalTarget] || {};
  const fieldPaths = supplierConfig.fieldPaths || {};
  const requirement = supplierConfig.requiredFields || {};
  const defaultValues = supplierConfig.defaultValues || {};
  const messages = supplierConfig.messages || {};

  function pickWithOverrides(key, fallbackPaths, fallbackDefault = "") {
    const paths = fieldPaths[key] || fallbackPaths;
    const value = pickFirstValue(paths, ...sources);
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
    const defaultValue = defaultValues[key];
    return defaultValue !== undefined && defaultValue !== null
      ? defaultValue
      : fallbackDefault;
  }

  const accountNumber = pickWithOverrides(
    "accountNumber",
      [
        "accountNumber",
        "account_number",
        "customerCode",
        "customer_code",
        "customerNumber",
        "customer_number",
        "accountId",
        "account_id",
        "delivery.accountNumber",
        "delivery.account_number",
        "delivery.customerNumber",
        "delivery.customer_number",
        "delivery.ship_to_number",
        "shipToNumber",
        "ship_to_number",
      ],
    ""
  );
  const branchId = pickWithOverrides(
    "branchId",
      [
        "branchId",
        "branch_id",
        "branchNumber",
        "branch_number",
        "branchCode",
        "branch_code",
        "delivery.branch",
        "delivery.branchId",
        "delivery.branch_id",
        "delivery.branch_code",
        "delivery.branch_number",
        "sellingBranchId",
        "selling_branch_id",
      ],
    ""
  );

  const accountNumberMessages =
    messages.accountNumber || "Account number is required.";
  const branchIdMessages =
    messages.branchId || "Branch/warehouse identifier is required.";

  if (requirement.accountNumber && !nonEmpty(accountNumber)) {
    errors.push(accountNumberMessages);
  }

  if (requirement.branchId && !nonEmpty(branchId)) {
    errors.push(branchIdMessages);
  }

  const sellingBranchId =
    pickFirstValue(
      [
        "sellingBranchId",
        "selling_branch_id",
        "delivery.sellingBranch",
        "delivery.selling_branch",
        "delivery.shipping_branch",
      ],
      ...sources
    ) || "";

  const jobName =
    pickFirstValue(
      ["jobName", "job_name", "delivery.jobName", "delivery.job_name", "delivery.site_name"],
      ...sources
    ) || "";

  const jobNumber =
    pickWithOverrides(
      "jobNumber",
      ["jobNumber", "job_number", "delivery.jobNumber", "delivery.job_number"],
      ""
    ) || "";

  const poNumber =
    pickFirstValue(
      ["poNumber", "po_number", "delivery.po_number", "delivery.purchase_order", "orderNumber", "order_number"],
      ...sources
    ) || "";

  const poNote =
    pickFirstValue(
      ["poNote", "po_note", "delivery.po_note", "delivery.delivery_instructions", "notes"],
      ...sources
    ) || "";

  const requestedDateRaw = pickFirstValue(
    [
      "requestedDate",
      "requested_date",
      "delivery.delivery_date.formattedDate",
      "delivery.delivery_date",
      "delivery.date",
      "delivery.expectedDate",
    ],
    ...sources
  );
  const requestedDate = normalizeDateInput(requestedDateRaw);
  if (requestedDateRaw && !requestedDate) {
    warnings.push("Unable to parse requested delivery date; leaving blank.");
  }

  const timeWindowRaw =
    pickFirstValue(
      [
        "timeWindow",
        "time_window",
        "delivery.time_code",
        "delivery.timeWindow",
        "delivery.time_window",
        "delivery.delivery_time",
      ],
      ...sources
    ) || "";
  const timeWindow = normalizeTimeWindow(timeWindowRaw);

  const exactFrom = normalizeTimeComponent(
    pickFirstValue(
      [
        "exactFrom",
        "delivery.exact_from",
        "delivery.exact_start",
        "delivery.exact_time_from",
        "delivery.exactTimeFrom",
      ],
      ...sources
    )
  );
  const exactTo = normalizeTimeComponent(
    pickFirstValue(
      [
        "exactTo",
        "delivery.exact_to",
        "delivery.exact_end",
        "delivery.exact_time_to",
        "delivery.exactTimeTo",
      ],
      ...sources
    )
  );

  const fulfillmentRaw =
    pickFirstValue(
      [
        "fulfillmentMethod",
        "fulfillment_method",
        "delivery.delivery_type",
        "delivery.fulfillmentMethod",
        "delivery.fulfillment_method",
      ],
      ...sources
    ) || "";
  const fulfillmentMethod = normalizeFulfillmentMethod(fulfillmentRaw);

  const shipTo = {
    name:
      pickFirstValue(
        ["shipTo.name", "delivery.jobName", "delivery.job_name", "delivery.site_name", "jobName"],
        ...sources
      ) || "",
    address1:
      pickFirstValue(
        ["shipTo.address1", "delivery.address_line_1", "delivery.address1", "delivery.address.address1"],
        ...sources
      ) || "",
    address2:
      pickFirstValue(
        ["shipTo.address2", "delivery.address_line_2", "delivery.address2", "delivery.address.address2"],
        ...sources
      ) || "",
    address3:
      pickFirstValue(
        ["shipTo.address3", "delivery.address_line_3", "delivery.address3", "delivery.address.address3"],
        ...sources
      ) || "",
    city:
      pickFirstValue(["shipTo.city", "delivery.city", "delivery.address.city"], ...sources) ||
      "",
    state:
      pickFirstValue(["shipTo.state", "delivery.state", "delivery.address.state"], ...sources) ||
      "",
    postalCode:
      pickFirstValue(
        [
          "shipTo.postalCode",
          "delivery.postal_code",
          "delivery.postalCode",
          "delivery.zip",
          "delivery.zipCode",
          "delivery.address.postalCode",
          "delivery.address.postal_code",
        ],
        ...sources
      ) || "",
    country:
      pickFirstValue(["shipTo.country", "delivery.country"], ...sources) || "USA",
  };

  const contact = {
    name:
      pickFirstValue(
        ["contact.name", "delivery.primary_contact", "delivery.contact_name"],
        ...sources
      ) || "",
    phone:
      pickFirstValue(
        ["contact.phone", "delivery.contact_phone", "delivery.phone", "delivery.contactPhone"],
        ...sources
      ) || "",
    email:
      pickFirstValue(
        ["contact.email", "delivery.contact_email", "delivery.email", "delivery.contactEmail"],
        ...sources
      ) || "",
    ccEmails: ensureArray(
      pickFirstValue(["contact.ccEmails", "delivery.contact_ccEmails", "delivery.ccEmails"], ...sources) ||
        []
    ),
    address: {
      address1:
        pickFirstValue(
          ["contact.address.address1", "delivery.contact_address_line_1"],
          ...sources
        ) || "",
      city:
        pickFirstValue(["contact.address.city", "delivery.contact_city"], ...sources) ||
        "",
      state:
        pickFirstValue(["contact.address.state", "delivery.contact_state"], ...sources) ||
        "",
      postalCode:
        pickFirstValue(
          ["contact.address.postalCode", "delivery.contact_postal_code", "delivery.contact_zip"],
          ...sources
        ) || "",
    },
  };

  const notes =
    pickFirstValue(
      ["notes", "delivery.delivery_instructions", "delivery.notes"],
      ...sources
    ) || "";

  const checkAvailability = coerceBoolean(
    pickFirstValue(["checkAvailability", "delivery.check_availability"], ...sources),
    true
  );
  const holdOrder = coerceBoolean(
    pickFirstValue(["holdOrder", "delivery.on_hold"], ...sources),
    false
  );

  const payment = pickFirstValue(["payment"], ...sources) || null;

  const requestId =
    pickWithOverrides(
      "requestId",
      ["requestId", "delivery.request_id", "delivery.reference_id", "orderId", "order_id"],
      ""
    ) || "";

  const rawLineItems =
    pickFirstValue(
      ["fullOrderItems", "lineItems", "templateItems", "delivery.lineItems"],
      fullOrder
    ) || pickFirstValue(["fullOrderItems", "lineItems"], parsedOrder) || [];
  const { normalized: lineItems, warnings: lineWarnings } =
    buildLineItemsFromOrder(rawLineItems);
  warnings.push(...lineWarnings);
  if (!lineItems.length) {
    errors.push("No valid line items found on the current order.");
  }

  if (finalTarget === "SRS") {
    if (!nonEmpty(contact.name)) warnings.push("SRS recommends providing a contact name.");
    if (!nonEmpty(contact.phone)) warnings.push("SRS recommends providing a contact phone.");
  }

  const unified = makeUnifiedOrder({
    target: finalTarget,
    accountNumber: accountNumber ? String(accountNumber) : "",
    branchId: branchId ? String(branchId) : "",
    sellingBranchId: sellingBranchId ? String(sellingBranchId) : "",
    jobName: jobName || "",
    jobNumber: jobNumber ? String(jobNumber) : "",
    poNumber: poNumber ? String(poNumber) : "",
    poNote: poNote || "",
    requestedDate,
    timeWindow,
    exactFrom,
    exactTo,
    fulfillmentMethod,
    shipTo,
    contact,
    lineItems,
    notes,
    checkAvailability,
    holdOrder,
    payment,
    requestId,
  });

  unified.lineItems = lineItems;

  return {
    order: unified,
    errors,
    warnings,
  };
}

const OrderTest = ({ fullOrder, parsedOrder }) => {
  const [lastResult, setLastResult] = useState(null);
  const [lastError, setLastError] = useState("");
  const [lastWarnings, setLastWarnings] = useState([]);

  async function testPlaceOrder(target) {
    try {
      setLastError("");
      setLastWarnings([]);
      const order = buildSampleOrder(target);
      const request = buildRequestFromUnified(order, {
        beacon: { apiSiteId: "WEB" },
        srs: { sourceSystem: "WEB" },
      });

      setLastResult({
        target,
        order,
        request,
      });
    } catch (error) {
      console.error("Order test failed", error);
      setLastError(error.message || "Unknown error");
      setLastResult(null);
    }
  }

  async function testCurrentOrder() {
    try {
      setLastError("");
      setLastWarnings([]);

      if (!fullOrder || Object.keys(fullOrder).length === 0) {
        setLastError("fullOrder is empty. Make sure an order has been started.");
        setLastResult(null);
        return;
      }

      const { order, errors, warnings } = buildUnifiedFromExisting(fullOrder, parsedOrder);

      if (warnings.length) {
        setLastWarnings(warnings);
      }

      if (errors.length) {
        setLastError(errors.join("\n"));
        setLastResult(null);
        return;
      }

      const request = buildRequestFromUnified(order, {
        beacon: { apiSiteId: "WEB" },
        srs: { sourceSystem: "WEB" },
      });

      setLastResult({
        target: order.target,
        order,
        request,
      });
    } catch (error) {
      console.error("Order build failed", error);
      setLastError(error.message || "Unknown error");
      setLastResult(null);
    }
  }

  return (
    <>
      <Text>Unified Order Test</Text>
      <Text>
        Build vendor-specific payloads from a single unified order object. Use
        the buttons below to preview the request shapes.
      </Text>
      <Flex direction="row" gap="small">
        <Button onClick={() => testPlaceOrder("ABC")}>Test ABC</Button>
        <Button onClick={() => testPlaceOrder("BEACON")}>Test Beacon</Button>
        <Button onClick={() => testPlaceOrder("SRS")}>Test SRS</Button>
        <Button onClick={testCurrentOrder}>Build From Current Order</Button>
      </Flex>
      {lastError && (
        <Text style={{ color: "#c0392b" }}>Error: {lastError}</Text>
      )}
      {lastWarnings.length > 0 && (
        <>
          <Text variant="microcopy" style={{ color: "#f39c12" }}>
            Warnings:
          </Text>
          {lastWarnings.map((warning, idx) => (
            <Text key={idx} variant="microcopy" style={{ color: "#f39c12" }}>
              • {warning}
            </Text>
          ))}
        </>
      )}
      {lastResult && (
        <>
          <Text variant="microcopy">{`Target: ${lastResult.target}`}</Text>
          <Text variant="microcopy">{`URL: ${lastResult.request.url}`}</Text>
          <Text variant="microcopy">
            {`Method: ${lastResult.request.method}`}
          </Text>
          <Text variant="microcopy" style={{ fontWeight: 600 }}>
            Headers:
          </Text>
          <HeaderList headers={lastResult.request.headers} />
          <Text variant="microcopy" style={{ fontWeight: 600 }}>
            Body Preview:
          </Text>
          <Monospace>
            {typeof lastResult.request.body === "string"
              ? lastResult.request.body
              : JSON.stringify(lastResult.request.body, null, 2)}
          </Monospace>
        </>
      )}
      {!lastResult && !lastError && (
        <Text variant="microcopy">
          Click a button above to build a sample request.
        </Text>
      )}
    </>
  );
};

export default OrderTest;
