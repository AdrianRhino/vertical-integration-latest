// HubSpot serverless: supplier-aware product search ladder backed by Supabase

const { createClient } = require("@supabase/supabase-js");
const searchConfig = require("../../../config/search.json");

const TABLE_NAME = "products";
const REQUIRED_ENVS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const MAX_LIMIT = 100;
const STRONG_MATCH_COUNT = 20;

const descriptionFieldCache = Object.create(null);
const skuFieldCache = Object.create(null);

const DESCRIPTION_CACHE_VERSION = "v2";
const SKU_CACHE_VERSION = "v1";

const STEP_HANDLERS = {
  RECENT: runRecentStep,
  SKU: runSkuStep,
  FUZZY: runFuzzyStep,
};

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 500; // 500ms
const MAX_RETRY_DELAY = 5000; // 5 seconds

/**
 * Retry with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} initialDelay - Initial delay in ms
 * @param {number} maxDelay - Maximum delay in ms
 * @returns {Promise} Result of function execution
 */
async function retryWithBackoff(fn, maxRetries = MAX_RETRIES, initialDelay = INITIAL_RETRY_DELAY, maxDelay = MAX_RETRY_DELAY) {
  let lastError;
  let delay = initialDelay;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Don't retry on validation errors (4xx)
      if (error.response?.status >= 400 && error.response?.status < 500) {
        throw error;
      }
      
      // If this was the last attempt, throw the error
      if (attempt === maxRetries) {
        console.error(`All ${maxRetries + 1} retry attempts failed`);
        throw error;
      }
      
      // Wait before retrying with exponential backoff
      console.warn(`Attempt ${attempt + 1} failed, retrying in ${delay}ms...`, error.message);
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Exponential backoff: double the delay, but cap at maxDelay
      delay = Math.min(delay * 2, maxDelay);
    }
  }
  
  throw lastError;
}

/**
 * Execute ladder with retry and fallback
 */
async function executeLadderWithRetry(params) {
  try {
    return await retryWithBackoff(() => executeLadder(params));
  } catch (error) {
    console.error("executeLadder failed after retries, using fallback", error);
    
    // Fallback: Return empty result instead of failing completely
    return {
      items: [],
      nextCursor: null,
      sourceStep: "FALLBACK",
      fallback: true,
      error: error.message
    };
  }
}

exports.main = async (context = {}) => {
  const startedAt = Date.now();

  try {
    assertEnv();

    const parameters = context.parameters || {};
    const supplierInput = String(parameters.supplier || "").trim();

    if (!supplierInput) {
      return buildResponse(400, {
        success: false,
        error: "supplier parameter is required (ABC | SRS | BEACON)",
      });
    }

    const supplierKey = supplierInput.toUpperCase();
    const supplierFilter = supplierInput.toLowerCase();
    const supplierConfig = getSupplierConfig(supplierKey);

    if (!supplierConfig) {
      return buildResponse(400, {
        success: false,
        error: `Unsupported supplier '${supplierInput}'. Allowed: ${Object.keys(searchConfig.suppliers || {}).join(
          ", "
        )}`,
      });
    }

    const query = sanitizeQuery(parameters.q);
    const cursor = parseCursor(parameters.cursor);
    const filters = parameters.filters || {};
    const pageSize = coerceLimit(
      parameters.pageSize,
      supplierConfig.pageSize || searchConfig.defaultPageSize || 50
    );

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Execute ladder with retry and fallback
    const ladderResult = await executeLadderWithRetry({
      supabase,
      supplier: supplierFilter,
      supplierConfig,
      query,
      filters,
      cursor,
      pageSize,
    });

    return buildResponse(200, {
      success: true,
      ...ladderResult,
      meta: {
        supplier: supplierKey,
        query,
        pageSize,
        durationMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
        fallback: ladderResult.fallback || false,
      },
    });
  } catch (error) {
    console.error("supplierProducts failed", error);
    
    // Final fallback: Return empty result instead of error
    return buildResponse(200, {
      success: true,
      items: [],
      nextCursor: null,
      sourceStep: "FALLBACK",
      fallback: true,
      error: error.message,
      meta: {
        supplier: (context.parameters?.supplier || "").toUpperCase(),
        query: sanitizeQuery(context.parameters?.q),
        pageSize: 50,
        durationMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      },
    });
  }
};

async function executeLadder({ supabase, supplier, supplierConfig, query, filters, cursor, pageSize }) {
  const targetStep = cursor?.step;

  if (targetStep && STEP_HANDLERS[targetStep]) {
    return STEP_HANDLERS[targetStep]({
      supabase,
      supplier,
      supplierConfig,
      query,
      filters,
      cursor,
      pageSize,
    });
  }

  if (!query || query.length < 2) {
    return runRecentStep({
      supabase,
      supplier,
      supplierConfig,
      query,
      filters,
      cursor: null,
      pageSize,
    });
  }

  const skuResult = await runSkuStep({
    supabase,
    supplier,
    supplierConfig,
    query,
    filters,
    cursor: null,
    pageSize,
  });

  if (skuResult.items.length >= Math.min(pageSize, STRONG_MATCH_COUNT)) {
    return skuResult;
  }

  const fuzzyResult = await runFuzzyStep({
    supabase,
    supplier,
    supplierConfig,
    query,
    filters,
    cursor: null,
    pageSize,
  });

  if (!skuResult.items.length) {
    return fuzzyResult;
  }

  const merged = mergeResults(skuResult.items, fuzzyResult.items, pageSize, supplierConfig.primaryKey);
      
      return {
    items: merged.items,
    nextCursor: merged.nextCursor
      ? { ...merged.nextCursor, step: merged.step || fuzzyResult.sourceStep || "SKU" }
      : merged.nextCursor,
    sourceStep: merged.step || "SKU",
  };
}

async function runRecentStep({ supabase, supplier, pageSize, cursor }) {
  const limit = Math.min(pageSize, MAX_LIMIT);

  const query = supabase
    .from(TABLE_NAME)
    .select(selectColumns())
    .eq("supplier", supplier)
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (cursor?.id) {
    query.lt("id", cursor.id);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Recent step failed", error);
    throw new Error(`Recent step failed: ${error.message}`);
  }

  // Handle null/undefined data gracefully
  if (!data) {
    console.warn("Recent step returned null data, returning empty result");
    return emptyStep("RECENT");
  }

  return paginate(data, limit, "RECENT");
}

async function runSkuStep({ supabase, supplier, supplierConfig, query, pageSize, cursor }) {
  const limit = Math.min(pageSize, MAX_LIMIT);

  const skuFields = await resolveSkuFields({
    supabase,
    supplier,
    configuredFields: supplierConfig.skuFields || [],
  });

  if (!skuFields.length) {
    return emptyStep("SKU");
  }

  const likeTerm = `${escapeLike(query)}%`;
  const orClause = skuFields.map((field) => `${field}.ilike.${likeTerm}`).join(",");

  const builder = supabase
    .from(TABLE_NAME)
    .select(selectColumns())
    .eq("supplier", supplier)
    .or(orClause)
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (cursor?.id) {
    builder.lt("id", cursor.id);
  }

  const { data, error } = await builder;

  if (error) {
    console.error("SKU step failed", error);
    throw new Error(`SKU step failed: ${error.message}`);
  }

  // Handle null/undefined data gracefully
  if (!data) {
    console.warn("SKU step returned null data, returning empty result");
    return emptyStep("SKU");
  }

  return paginate(data, limit, "SKU");
}

async function runFuzzyStep({ supabase, supplier, supplierConfig, query, pageSize, cursor }) {
  const limit = Math.min(pageSize, MAX_LIMIT);
  const descriptionFields = await resolveDescriptionFields({
    supabase,
    supplier,
    configuredFields: supplierConfig.descriptionFields || [],
  });

  if (!descriptionFields.length) {
    return emptyStep("FUZZY");
  }

  const likeTerm = `%${escapeLike(query)}%`;
  const orClause = descriptionFields.map((field) => `${field}.ilike.${likeTerm}`).join(",");

  const builder = supabase
    .from(TABLE_NAME)
    .select(selectColumns())
    .eq("supplier", supplier)
    .or(orClause)
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (cursor?.id) {
    builder.lt("id", cursor.id);
  }

  const { data, error } = await builder;

  if (error) {
    console.error("Fuzzy step failed", error);
    throw new Error(`Fuzzy step failed: ${error.message}`);
  }

  // Handle null/undefined data gracefully
  if (!data) {
    console.warn("Fuzzy step returned null data, returning empty result");
    return emptyStep("FUZZY");
  }

  return paginate(data, limit, "FUZZY");
}

function paginate(rows = [], limit, step) {
  const page = Array.isArray(rows) ? rows.slice(0, limit) : [];
  const next = Array.isArray(rows) && rows.length > limit ? rows[limit] : null;
  const primaryKey = detectPrimaryKey(page);

  const nextCursor =
    next && primaryKey
      ? {
          step,
          id: next[primaryKey] ?? next.id ?? null,
        }
      : null;
      
      return {
    items: page,
    nextCursor,
    sourceStep: step,
  };
}

function mergeResults(primary = [], secondary = [], limit, primaryKey) {
  const seen = new Set();
  const merged = [];

  for (const item of primary) {
    const key = resolveItemKey(item, primaryKey);
    if (key && !seen.has(key)) {
      seen.add(key);
      merged.push(item);
    }
  }

  for (const item of secondary) {
    if (merged.length >= limit) break;
    const key = resolveItemKey(item, primaryKey);
    if (key && !seen.has(key)) {
      seen.add(key);
      merged.push(item);
    }
  }

  return {
    items: merged.slice(0, limit),
    nextCursor: merged.length === limit ? { id: resolveItemKey(merged[merged.length - 1], primaryKey) } : null,
    step: "SKU+FUZZY",
  };
}

function resolveItemKey(item, primaryKey) {
  if (!item || typeof item !== "object") return null;
  if (primaryKey && item[primaryKey] != null) return item[primaryKey];
  if (item.id != null) return item.id;
  if (item.itemnumber != null) return item.itemnumber;
  if (item.sku != null) return item.sku;
  return null;
}

function emptyStep(step) {
  return {
    items: [],
    nextCursor: null,
    sourceStep: step,
  };
}

function detectPrimaryKey(rows) {
  if (!rows || !rows.length) return "id";
  const sample = rows[0];
  if ("id" in sample) return "id";
  if ("itemnumber" in sample) return "itemnumber";
  if ("sku" in sample) return "sku";
  return "id";
}

function selectColumns() {
  return "*";
}

function sanitizeQuery(q) {
  if (!q && q !== 0) return "";
  return String(q).trim();
}

function assertEnv() {
  const missing = REQUIRED_ENVS.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing env vars: ${missing.join(", ")}`);
  }
}

function getSupplierConfig(supplier) {
  const suppliers = searchConfig.suppliers || {};
  return suppliers[supplier] || null;
}

function buildResponse(statusCode, body) {
  return { statusCode, body };
}

function coerceLimit(raw, fallback) {
  const parsed = Number(raw);
  const base = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  return Math.min(base, MAX_LIMIT);
}

function parseCursor(raw) {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(String(raw));
  } catch (error) {
    console.warn("Failed to parse cursor", raw, error.message);
    return null;
  }
}

function escapeLike(value) {
  return String(value || "").replace(/[%_]/g, (match) => `\\${match}`);
}

async function resolveDescriptionFields({ supabase, supplier, configuredFields }) {
  if (!Array.isArray(configuredFields) || !configuredFields.length) {
    return [];
  }

  const targets = configuredFields
    .map((field) => String(field || "").trim())
    .filter(Boolean);

  if (!targets.length) {
    return [];
  }

  const cacheKey = `${supplier.toUpperCase()}:desc:${DESCRIPTION_CACHE_VERSION}:${targets.join("|")}`;
  if (descriptionFieldCache[cacheKey]) {
    return descriptionFieldCache[cacheKey];
  }

  const { data: sampleRows, error } = await supabase
    .from(TABLE_NAME)
    .select("*")
    .eq("supplier", supplier)
    .limit(1);

  if (error) {
    console.warn("resolveDescriptionFields sample query failed", error.message);
    descriptionFieldCache[cacheKey] = targets;
    return targets;
  }

  const sampleRow = Array.isArray(sampleRows) && sampleRows.length ? sampleRows[0] : null;
  if (!sampleRow || typeof sampleRow !== "object") {
    descriptionFieldCache[cacheKey] = targets;
    return targets;
  }

  const rowKeys = Object.keys(sampleRow);
  const resolved = targets.reduce((acc, target) => {
    const match = rowKeys.find((key) => normalizeFieldName(key) === normalizeFieldName(target));
    if (match) {
      acc.push(match);
    }
    return acc;
  }, []);

  let deduped = Array.from(new Set(resolved));

  if (!deduped.length) {
    deduped = rowKeys.filter((key) => {
      const normalized = normalizeFieldName(key);
      return (
        normalized.includes("description") ||
        normalized.includes("family") ||
        normalized.includes("name") ||
        normalized.includes("title")
      );
    });
  }

  descriptionFieldCache[cacheKey] = deduped;
  return deduped;
}

function normalizeFieldName(name) {
  return String(name || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

async function resolveSkuFields({ supabase, supplier, configuredFields }) {
  if (!Array.isArray(configuredFields) || !configuredFields.length) {
    return [];
  }

  const targets = configuredFields
    .map((field) => String(field || "").trim())
    .filter(Boolean);

  if (!targets.length) {
    return [];
  }

  const cacheKey = `${supplier.toUpperCase()}:sku:${SKU_CACHE_VERSION}:${targets.join("|")}`;
  if (skuFieldCache[cacheKey]) {
    return skuFieldCache[cacheKey];
  }

  const { data: sampleRows, error } = await supabase
    .from(TABLE_NAME)
    .select("*")
    .eq("supplier", supplier)
    .limit(1);

  if (error) {
    console.warn("resolveSkuFields sample query failed", error.message);
    skuFieldCache[cacheKey] = [];
    return [];
  }

  const sampleRow = Array.isArray(sampleRows) && sampleRows.length ? sampleRows[0] : null;
  if (!sampleRow || typeof sampleRow !== "object") {
    skuFieldCache[cacheKey] = [];
    return [];
  }

  const rowKeys = Object.keys(sampleRow);
  const resolved = targets.reduce((acc, target) => {
    const match = rowKeys.find((key) => normalizeFieldName(key) === normalizeFieldName(target));
    if (match) {
      acc.push(match);
    }
    return acc;
  }, []);

  const deduped = Array.from(new Set(resolved));
  skuFieldCache[cacheKey] = deduped;
  return deduped;
}

