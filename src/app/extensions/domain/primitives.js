// SHAPE: Input → Filter → Transform → Store → Output → Loop
// INPUT: raw data values, paths, rules
// FILTER: validate inputs are valid
// TRANSFORM: convert/format values
// STORE: return transformed values
// OUTPUT: primitives ready for composition
// LOOP: primitives can be chained/composed

/**
 * The 4 Base Primitives (DNA of the system)
 * All order processing reduces to these 4 composable operations
 */

/**
 * 1. ACCESSOR - Get value from nested object using dot path
 * Pure function: no side effects, deterministic
 * 
 * @param {Object} obj - Source object
 * @param {string} path - Dot-separated path (e.g., "delivery.accountNumber")
 * @returns {*} Value at path, or undefined if not found
 */
export function accessor(obj, path) {
  if (!obj || !path) return undefined;
  const parts = String(path).split(".");
  let current = obj;
  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
}

/**
 * 2. NORMALIZER - Convert value to standard format
 * Pure function: handles dates, strings, numbers, booleans
 * 
 * @param {*} value - Raw value to normalize
 * @param {string} type - Target type: "date", "string", "number", "boolean"
 * @returns {*} Normalized value in standard format
 */
export function normalizer(value, type = "string") {
  if (value === undefined || value === null) return undefined;

  switch (type) {
    case "date":
      return normalizeDate(value);
    case "string":
      return normalizeString(value);
    case "number":
      return normalizeNumber(value);
    case "boolean":
      return normalizeBoolean(value);
    default:
      return value;
  }
}

/**
 * Normalize date to YYYY-MM-DD format
 */
function normalizeDate(value) {
  if (!value) return "";
  
  // Already in YYYY-MM-DD format
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  
  // Handle Date objects
  if (value instanceof Date && !isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  
  // Handle string dates (MM/DD/YYYY, MM-DD-YYYY, etc.)
  const str = String(value).trim();
  if (!str) return "";
  
  // MM/DD/YYYY or MM/DD/YY
  const slashMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMatch) {
    const [, month, day, year] = slashMatch;
    const normalizedYear = year.length === 2 ? `20${year.padStart(2, "0")}` : year.padStart(4, "0");
    return formatDateParts(normalizedYear, month, day);
  }
  
  // MM-DD-YYYY or MM-DD-YY
  const dashMatch = str.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
  if (dashMatch) {
    const [, month, day, year] = dashMatch;
    const normalizedYear = year.length === 2 ? `20${year.padStart(2, "0")}` : year.padStart(4, "0");
    return formatDateParts(normalizedYear, month, day);
  }
  
  // Handle object with formattedDate
  if (typeof value === "object" && value.formattedDate) {
    return normalizeDate(value.formattedDate);
  }
  
  // Handle object with year/month/day
  if (typeof value === "object" && "year" in value && "month" in value) {
    const day = value.date ?? value.day ?? 1;
    const date = new Date(value.year, value.month, day);
    if (!isNaN(date.getTime())) {
      return date.toISOString().slice(0, 10);
    }
  }
  
  // Try parsing as Date
  const parsed = new Date(str);
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

/**
 * Normalize string: trim whitespace, handle empty strings
 */
function normalizeString(value) {
  if (value === undefined || value === null) return "";
  const str = String(value).trim();
  return str === "" ? undefined : str;
}

/**
 * Normalize number: convert to number, return undefined if invalid
 */
function normalizeNumber(value) {
  if (value === undefined || value === null) return undefined;
  const num = Number(value);
  return isNaN(num) ? undefined : num;
}

/**
 * Normalize boolean: handle strings, numbers, booleans
 */
function normalizeBoolean(value) {
  if (typeof value === "boolean") return value;
  if (value === undefined || value === null) return false;
  const str = String(value).toLowerCase();
  return ["yes", "true", "1", "y"].includes(str);
}

/**
 * 3. VALIDATOR - Check if value meets rules
 * Pure function: returns validation result object
 * 
 * @param {*} value - Value to validate
 * @param {Object} rules - Validation rules: { required, type, min, max, enum, pattern }
 * @returns {{ valid: boolean, error?: string }} Validation result
 */
export function validator(value, rules = {}) {
  // Required check
  if (rules.required && (value === undefined || value === null || value === "")) {
    return { valid: false, error: rules.message || "Field is required" };
  }
  
  // Skip other checks if value is empty and not required
  if (value === undefined || value === null || value === "") {
    return { valid: true };
  }
  
  // Type check
  if (rules.type) {
    const normalized = normalizer(value, rules.type);
    if (normalized === undefined && value !== undefined) {
      return { valid: false, error: `Invalid ${rules.type} format` };
    }
  }
  
  // Number range checks
  if (rules.type === "number") {
    const num = Number(value);
    if (isNaN(num)) {
      return { valid: false, error: "Must be a number" };
    }
    if (rules.min !== undefined && num < rules.min) {
      return { valid: false, error: `Must be at least ${rules.min}` };
    }
    if (rules.max !== undefined && num > rules.max) {
      return { valid: false, error: `Must be at most ${rules.max}` };
    }
  }
  
  // String length checks
  if (rules.type === "string") {
    const str = String(value);
    if (rules.minLength !== undefined && str.length < rules.minLength) {
      return { valid: false, error: `Must be at least ${rules.minLength} characters` };
    }
    if (rules.maxLength !== undefined && str.length > rules.maxLength) {
      return { valid: false, error: `Must be at most ${rules.maxLength} characters` };
    }
  }
  
  // Enum check
  if (rules.enum && Array.isArray(rules.enum)) {
    if (!rules.enum.includes(value)) {
      return { valid: false, error: `Must be one of: ${rules.enum.join(", ")}` };
    }
  }
  
  // Pattern check (regex)
  if (rules.pattern && typeof value === "string") {
    const regex = new RegExp(rules.pattern);
    if (!regex.test(value)) {
      return { valid: false, error: rules.patternMessage || "Invalid format" };
    }
  }
  
  return { valid: true };
}

/**
 * 4. FORMATTER - Convert value to target format
 * Pure function: handles supplier-specific formatting
 * 
 * @param {*} value - Value to format
 * @param {Object} config - Formatting config: { truncate, prefix, suffix, transform }
 * @param {string} fieldName - Field name for context (optional)
 * @returns {*} Formatted value
 */
export function formatter(value, config = {}, fieldName = "") {
  if (value === undefined || value === null) return undefined;
  
  let result = value;
  
  // Apply transform function if provided
  if (config.transform && typeof config.transform === "function") {
    result = config.transform(result);
  }
  
  // Truncate string
  if (config.truncate && typeof result === "string") {
    result = result.slice(0, config.truncate);
  }
  
  // Add prefix
  if (config.prefix && typeof result === "string") {
    result = config.prefix + result;
  }
  
  // Add suffix
  if (config.suffix && typeof result === "string") {
    result = result + config.suffix;
  }
  
  // Convert to string and strip non-digits (for phone numbers, etc.)
  if (config.stripNonDigits && typeof result === "string") {
    result = result.replace(/\D+/g, "");
  }
  
  // Convert to uppercase
  if (config.uppercase && typeof result === "string") {
    result = result.toUpperCase();
  }
  
  // Convert to lowercase
  if (config.lowercase && typeof result === "string") {
    result = result.toLowerCase();
  }
  
  return result;
}

/**
 * Helper: Set nested value in object using dot path
 * Used by transformation engine to build supplier payloads
 * 
 * @param {Object} obj - Target object
 * @param {string} path - Dot-separated path
 * @param {*} value - Value to set
 */
export function setNestedValue(obj, path, value) {
  if (!obj || !path) return;
  const parts = String(path).split(".");
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || typeof current[part] !== "object") {
      current[part] = {};
    }
    current = current[part];
  }
  current[parts[parts.length - 1]] = value;
}

/**
 * Helper: Pick first non-empty value from multiple sources
 * Composes Accessor + Normalizer
 * 
 * @param {string[]} paths - Array of dot paths to try
 * @param {...Object} sources - Source objects to search
 * @returns {*} First non-empty value found, or undefined
 */
export function pickFirstValue(paths, ...sources) {
  for (const source of sources) {
    if (!source) continue;
    for (const path of paths) {
      const value = accessor(source, path);
      if (value !== undefined && value !== null && value !== "") {
        return value;
      }
    }
  }
  return undefined;
}

