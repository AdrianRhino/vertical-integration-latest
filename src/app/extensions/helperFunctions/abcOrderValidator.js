const fs = require("fs");
const path = require("path");

// SHAPE: Input → Filter → Transform → Store → Output → Loop
// INPUT: raw ABC order payload array
// FILTER: discard falsy entries, capture validation issues
// TRANSFORM: normalize purchase orders, dates, line ids, contacts, ship-to blocks
// STORE: stash fixes/errors in per-order reports (in-memory)
// OUTPUT: { payload, report, hasErrors }
// LOOP: callable per submission; CLI harness enables repeated manual checks

const validationConfig = require("../config/abcOrderValidation.json");

function validateAbcOrders(rawPayload, options = {}) {
  const payloadArray = Array.isArray(rawPayload) ? rawPayload : [];
  const now = options.now || new Date();
  const safePayload = payloadArray
    .filter(Boolean)
    .map((order) => safeClone(order));

  const report = safePayload.map((order, index) =>
    normalizeOrder(order, index, now)
  );

  return {
    payload: safePayload,
    report,
    hasErrors: report.some((entry) => entry.errors.length > 0),
  };
}

function normalizeOrder(order, index, now) {
  const issues = {
    index,
    requestId: order.requestId || null,
    fixes: [],
    warnings: [],
    errors: [],
  };

  ensurePurchaseOrder(order, issues);
  ensureDeliveryDate(order, issues, now);
  ensureLines(order, issues);
  ensureShipTo(order, issues);
  ensureContacts(order, issues);

  return issues;
}

function ensurePurchaseOrder(order, issues) {
  const config = validationConfig.purchaseOrder || {};
  const required = Boolean(config.required);
  const maxLength = Number(config.maxLength) > 0 ? config.maxLength : 20;
  const prefix = String(config.defaultPrefix || "").trim();
  const sequence = String(config.fallbackSequence || "").trim();

  const current = typeof order.purchaseOrder === "string" ? order.purchaseOrder.trim() : "";

  if (!current && required) {
    const base = order.requestId ? sanitizeForId(order.requestId) : sequence;
    const fallbackValue = (prefix + base).slice(0, maxLength);
    order.purchaseOrder = fallbackValue;
    issues.fixes.push(
      `purchaseOrder missing → set to fallback "${order.purchaseOrder}"`
    );
  } else if (current.length > maxLength) {
    order.purchaseOrder = current.slice(0, maxLength);
    issues.warnings.push(
      `purchaseOrder truncated to ${maxLength} chars`
    );
  } else if (current && current !== order.purchaseOrder) {
    order.purchaseOrder = current;
    issues.fixes.push("purchaseOrder trimmed");
  }

  if (!order.purchaseOrder && required) {
    issues.errors.push("purchaseOrder is required but missing");
  }
}

function ensureDeliveryDate(order, issues, now) {
  const dateConfig = validationConfig.dates?.deliveryRequestedFor || {};
  const expectedFormat = dateConfig.format || "YYYY-MM-DD";
  const fallbackDays = Number(dateConfig.fallbackDaysFromToday) || 0;

  if (!order.dates) order.dates = {};
  const rawDate = order.dates.deliveryRequestedFor;

  const normalized = normalizeDate(rawDate, expectedFormat);

  if (normalized) {
    if (normalized !== rawDate) {
      order.dates.deliveryRequestedFor = normalized;
      issues.fixes.push("dates.deliveryRequestedFor normalized to ISO");
    }
    return;
  }

  const fallbackDate = addDays(now, fallbackDays);
  const fallbackIso = formatDateISO(fallbackDate);

  order.dates.deliveryRequestedFor = fallbackIso;
  issues.warnings.push(
    `dates.deliveryRequestedFor invalid → defaulted to ${fallbackIso}`
  );
}

function ensureLines(order, issues) {
  if (!Array.isArray(order.lines)) {
    issues.errors.push("lines must be an array");
    order.lines = [];
    return;
  }

  const config = validationConfig.lines || {};
  const idType = config.idType || "integer";
  const maxCount = Number(config.maxCount) || Infinity;

  if (order.lines.length > maxCount) {
    order.lines = order.lines.slice(0, maxCount);
    issues.warnings.push(`lines trimmed to first ${maxCount} items`);
  }

  order.lines.forEach((line, lineIndex) => {
    if (!line || typeof line !== "object") {
      issues.errors.push(`line[${lineIndex}] is not an object`);
      return;
    }

    if (idType === "integer") {
      const numericId = coerceInteger(line.id);
      if (numericId === null) {
        issues.errors.push(`line[${lineIndex}].id must be an integer`);
      } else if (numericId !== line.id) {
        line.id = numericId;
        issues.fixes.push(`line[${lineIndex}].id coerced to ${numericId}`);
      }
    }

    if (typeof line.itemNumber === "string") {
      const trimmed = line.itemNumber.trim();
      if (trimmed !== line.itemNumber) {
        line.itemNumber = trimmed;
        issues.fixes.push(`line[${lineIndex}].itemNumber trimmed`);
      }
    }
  });
}

function ensureShipTo(order, issues) {
  if (!order.shipTo || typeof order.shipTo !== "object") return;

  const config = validationConfig.shipTo || {};
  if (!config.omitEmptyAddress) return;

  const address = order.shipTo.address;
  if (!address || typeof address !== "object") return;

  const values = Object.values(address);
  const allEmpty = values.every((value) => {
    if (value === null || value === undefined) return true;
    if (typeof value === "string" && value.trim() === "") return true;
    return false;
  });

  if (allEmpty) {
    delete order.shipTo.address;
    issues.fixes.push("shipTo.address removed (all fields empty)");
  }
}

function ensureContacts(order, issues) {
  if (!order.shipTo || typeof order.shipTo !== "object") return;

  const config = validationConfig.contacts || {};
  const desiredCode = config.preferredFunctionCode;
  const defaultContact = config.default || null;

  if (!Array.isArray(order.shipTo.contacts)) {
    order.shipTo.contacts = [];
  }

  const hasDesiredContact = desiredCode
    ? order.shipTo.contacts.some(
        (contact) =>
          contact &&
          typeof contact === "object" &&
          String(contact.functionCode || "").toUpperCase() === desiredCode
      )
    : order.shipTo.contacts.length > 0;

  if (!hasDesiredContact && defaultContact) {
    order.shipTo.contacts.push(safeClone(defaultContact));
    issues.fixes.push(
      `shipTo.contacts appended default ${desiredCode} contact`
    );
  }
}

function normalizeDate(value, expectedFormat) {
  if (typeof value !== "string" || !value.trim()) return null;
  const trimmed = value.trim();

  if (expectedFormat === "YYYY-MM-DD" && isIsoDate(trimmed)) {
    return trimmed;
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return formatDateISO(parsed);
  }

  return null;
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function formatDateISO(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function coerceInteger(value) {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.trim());
    if (Number.isInteger(parsed)) return parsed;
  }
  return null;
}

function sanitizeForId(value) {
  if (typeof value !== "string") return String(value || "");
  return value.replace(/[^A-Za-z0-9]/g, "").slice(0, 12) || "PO";
}

function safeClone(input) {
  return JSON.parse(JSON.stringify(input ?? {}));
}

function readJson(filePath) {
  try {
    const absolutePath = path.resolve(process.cwd(), filePath);
    const contents = fs.readFileSync(absolutePath, "utf8");
    return JSON.parse(contents);
  } catch (error) {
    throw new Error(`Unable to read JSON at ${filePath}: ${error.message}`);
  }
}

if (require.main === module) {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: node abcOrderValidator.js <payload.json>");
    process.exit(1);
  }

  const payload = readJson(filePath);
  const result = validateAbcOrders(payload);
  console.log(JSON.stringify(result, null, 2));
}

module.exports = {
  validateAbcOrders,
};

