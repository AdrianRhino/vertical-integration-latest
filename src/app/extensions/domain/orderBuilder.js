// SHAPE: Input → Filter → Transform → Store → Output → Loop
// INPUT: HubSpot deal data, user inputs, parsed order
// FILTER: Validate required fields, sanitize values
// TRANSFORM: Normalize to InternalOrder shape using primitives
// STORE: Return complete InternalOrder
// OUTPUT: InternalOrder ready for supplier transformation
// LOOP: Builder can be called repeatedly as data changes

import { accessor, normalizer, validator, pickFirstValue } from "./primitives.js";
import { makeInternalOrder, makeCanonicalLineItem } from "./internalOrder.js";
import unifiedConfig from "../config/unifiedOrderConfig.json";

/**
 * Build InternalOrder from HubSpot data and user inputs
 * Composes Accessor + Normalizer + Validator primitives
 * 
 * @param {Object} fullOrder - Full order from HubSpot/UI
 * @param {Object} parsedOrder - Parsed order data
 * @param {Object} crmData - Additional CRM data
 * @returns {{ order: InternalOrder, errors: string[], warnings: string[] }}
 */
export function buildInternalOrder(fullOrder = {}, parsedOrder = {}, crmData = {}) {
  const sources = [fullOrder || {}, parsedOrder || {}, crmData || {}];
  const errors = [];
  const warnings = [];

  // Determine supplier
  const supplierRaw = pickFirstValue(
    ["supplier", "delivery.supplier", "vendor", "target"],
    ...sources
  ) || "ABC";
  const target = String(supplierRaw).trim().toUpperCase();
  const supportedTargets = Object.keys(unifiedConfig.suppliers || {});
  const finalTarget = supportedTargets.includes(target) ? target : "ABC";
  
  if (!supportedTargets.includes(target)) {
    warnings.push(`Supplier "${target}" not recognized, defaulting to ABC.`);
  }

  const supplierConfig = unifiedConfig.suppliers?.[finalTarget] || {};
  const fieldPaths = supplierConfig.fieldPaths || {};
  const requirement = supplierConfig.requiredFields || {};
  const defaultValues = supplierConfig.defaultValues || {};

  // Helper to pick value with fallback to defaults
  function pickWithDefaults(key, fallbackPaths, fallbackDefault = "") {
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

  // Extract account number
  const accountNumber = pickWithDefaults(
    "accountNumber",
    [
      "accountNumber",
      "account_number",
      "customerCode",
      "customer_code",
      "delivery.accountNumber",
      "shipToNumber",
    ],
    ""
  );

  // Extract branch ID
  const branchId = pickWithDefaults(
    "branchId",
    [
      "branchId",
      "branch_id",
      "branchNumber",
      "branch_code",
      "delivery.branchId",
      "delivery.branch_code",
    ],
    ""
  );

  // Validate required fields
  if (requirement.accountNumber && !accountNumber) {
    errors.push(supplierConfig.messages?.accountNumber || "Account number is required.");
  }
  if (requirement.branchId && !branchId) {
    errors.push(supplierConfig.messages?.branchId || "Branch ID is required.");
  }

  // Extract other fields
  const jobName = pickFirstValue(
    ["jobName", "job_name", "delivery.jobName", "delivery.site_name"],
    ...sources
  ) || "";

  const jobNumber = pickWithDefaults(
    "jobNumber",
    ["jobNumber", "job_number", "delivery.jobNumber"],
    ""
  ) || "";

  const poNumber = pickFirstValue(
    ["poNumber", "po_number", "delivery.po_number", "orderNumber"],
    ...sources
  ) || "";

  // Extract delivery date
  const requestedDateRaw = pickFirstValue(
    [
      "requestedDate",
      "requested_date",
      "delivery.delivery_date.formattedDate",
      "delivery.delivery_date",
      "delivery.date",
    ],
    ...sources
  );
  const requestedDate = normalizer(requestedDateRaw, "date");
  if (requestedDateRaw && !requestedDate) {
    warnings.push("Unable to parse requested delivery date; leaving blank.");
  }

  // Extract time window
  const timeWindowRaw = pickFirstValue(
    [
      "timeWindow",
      "time_window",
      "delivery.time_code",
      "delivery.timeWindow",
    ],
    ...sources
  ) || "";
  const timeCode = normalizeTimeWindow(timeWindowRaw);

  // Extract delivery method
  const fulfillmentRaw = pickFirstValue(
    [
      "fulfillmentMethod",
      "fulfillment_method",
      "delivery.delivery_type",
      "delivery.fulfillmentMethod",
    ],
    ...sources
  ) || "";
  const deliveryMethod = normalizeFulfillmentMethod(fulfillmentRaw);

  // Extract address
  const address = {
    line1: pickFirstValue(
      ["shipTo.address1", "delivery.address_line_1", "delivery.address1"],
      ...sources
    ) || "",
    city: pickFirstValue(["shipTo.city", "delivery.city"], ...sources) || "",
    state: pickFirstValue(["shipTo.state", "delivery.state"], ...sources) || "",
    postalCode: pickFirstValue(
      ["shipTo.postalCode", "delivery.postal_code", "delivery.zip"],
      ...sources
    ) || "",
  };

  // Extract contact
  const contact = {
    name: pickFirstValue(
      ["contact.name", "delivery.primary_contact", "delivery.contact_name"],
      ...sources
    ) || "",
    phone: pickFirstValue(
      ["contact.phone", "delivery.contact_phone", "delivery.phone"],
      ...sources
    ) || "",
    email: pickFirstValue(
      ["contact.email", "delivery.contact_email", "delivery.email"],
      ...sources
    ) || "",
  };

  // Extract notes
  const notes = pickFirstValue(
    ["notes", "delivery.delivery_instructions", "delivery.notes"],
    ...sources
  ) || "";

  // Extract line items
  const rawLineItems =
    pickFirstValue(
      ["fullOrderItems", "lineItems", "templateItems", "delivery.lineItems"],
      fullOrder
    ) || pickFirstValue(["fullOrderItems", "lineItems"], parsedOrder) || [];

  const { normalized: lineItems, warnings: lineWarnings } =
    normalizeLineItems(rawLineItems);
  warnings.push(...lineWarnings);

  if (!lineItems.length) {
    errors.push("No valid line items found on the current order.");
  }

  // Extract request ID
  const requestId = pickWithDefaults(
    "requestId",
    ["requestId", "delivery.request_id", "orderId"],
    ""
  ) || "";

  // Build InternalOrder
  const order = makeInternalOrder({
    supplier: finalTarget,
    accountNumber: accountNumber ? String(accountNumber) : "",
    branchId: branchId ? String(branchId) : "",
    status: "Draft",
    poNumber: poNumber ? String(poNumber) : "",
    jobName: jobName || "",
    jobNumber: jobNumber ? String(jobNumber) : "",
    delivery: {
      method: deliveryMethod,
      date: requestedDate || "",
      timeCode: timeCode,
      address: address,
      contact: contact,
      notes: notes,
    },
    lineItems: lineItems,
    requestId: requestId,
  });

  return { order, errors, warnings };
}

/**
 * Normalize line items to CanonicalLineItem format
 * Uses Accessor + Normalizer + Validator primitives
 * 
 * @param {Array} items - Raw line items
 * @returns {{ normalized: CanonicalLineItem[], warnings: string[] }}
 */
export function normalizeLineItems(items) {
  const normalized = [];
  const warnings = [];

  if (!Array.isArray(items)) {
    return { normalized, warnings };
  }

  items.forEach((item, index) => {
    // Extract SKU
    const sku = pickFirstValue(
      ["itemCode", "sku", "itemNumber", "itemnumber", "productNumber"],
      item
    ) || "";

    // Extract quantity
    const qtyRaw = pickFirstValue(
      ["qty", "quantity", "orderedQty.value", "orderedQty"],
      item
    );
    const qty =
      typeof qtyRaw === "object" && qtyRaw && "value" in qtyRaw
        ? Number(qtyRaw.value)
        : Number(qtyRaw);

    // Extract UOM
    const uom = pickFirstValue(
      ["uom", "unitOfMeasure", "orderedQty.uom"],
      item
    ) || "EA";

    // Validate required fields
    if (!sku || !Number.isFinite(qty) || qty <= 0) {
      warnings.push(`Line ${index + 1}: missing SKU or invalid quantity`);
      return;
    }

    // Extract optional fields
    const unitPriceRaw = pickFirstValue(["unitPrice", "price", "unitPrice.value"], item);
    const unitPrice =
      unitPriceRaw !== undefined && unitPriceRaw !== null
        ? Number(unitPriceRaw)
        : undefined;

    const normalizedItem = makeCanonicalLineItem({
      sku: String(sku),
      qty: qty,
      uom: String(uom || "EA"),
      name: pickFirstValue(["name", "title"], item) || "",
      description: pickFirstValue(
        ["desc", "description", "itemDescription"],
        item
      ) || "",
      price: Number.isFinite(unitPrice) ? unitPrice : undefined,
      variant: pickFirstValue(["option", "options", "variant"], item) || "",
      category: pickFirstValue(["category"], item) || "",
    });

    normalized.push(normalizedItem);
  });

  return { normalized, warnings };
}

/**
 * Normalize time window to standard format
 */
function normalizeTimeWindow(raw) {
  if (!raw) return "Anytime";
  const val = String(raw).toLowerCase();
  if (["am", "morning"].includes(val)) return "Morning";
  if (["pm", "afternoon"].includes(val)) return "Afternoon";
  if (["special", "special request", "special_request"].includes(val)) return "Special";
  if (["exact", "specific", "st"].includes(val)) return "Exact";
  if (["range", "tr"].includes(val)) return "Range";
  return "Anytime";
}

/**
 * Normalize fulfillment method to standard format
 */
function normalizeFulfillmentMethod(raw) {
  if (!raw) return "Delivery";
  const val = String(raw).toLowerCase();
  if (["pickup", "pickup_branch", "cpu", "pick-up"].includes(val)) {
    return "Pickup";
  }
  return "Delivery";
}

