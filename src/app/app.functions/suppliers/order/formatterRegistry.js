// SHAPE: Input → Filter → Transform → Store → Output → Loop
// INPUT: Supplier name, environment
// FILTER: Validate supplier exists in registry
// TRANSFORM: Load appropriate formatter
// STORE: Return formatter function
// OUTPUT: Formatter ready for use
// LOOP: Registry can provide formatters for multiple suppliers

const { formatOrder } = require('./formatOrder');

/**
 * Formatter registry
 * Maps supplier names to their formatting functions
 * 
 * To add a new supplier:
 * 1. Create config file: config/{supplier}OrderConfig.json
 * 2. Add entry to FORMATTER_MAP below
 * 3. formatOrder() will handle the rest
 */
const FORMATTER_MAP = {
  'SRS': formatOrder,
  'ABC': formatOrder,
  'BEACON': formatOrder,
  // Add new suppliers here as they're added
};

/**
 * Get formatter for a supplier
 * 
 * @param {string} supplier - Supplier name (case-insensitive)
 * @param {string} environment - Environment ("production", "sandbox", "dev")
 * @returns {Function} Formatter function
 */
function getFormatter(supplier, environment = 'sandbox') {
  const supplierUpper = String(supplier || '').toUpperCase();
  const formatter = FORMATTER_MAP[supplierUpper];
  
  if (!formatter) {
    throw new Error(`No formatter found for supplier: ${supplier}`);
  }
  
  // Return a bound formatter function
  return (orderBody) => formatter(orderBody, supplierUpper, environment);
}

/**
 * Get all available suppliers
 * @returns {string[]} Array of supplier names
 */
function getAvailableSuppliers() {
  return Object.keys(FORMATTER_MAP);
}

/**
 * Register a new supplier formatter
 * 
 * @param {string} supplier - Supplier name
 * @param {Function} formatter - Formatter function
 */
function registerFormatter(supplier, formatter) {
  const supplierUpper = String(supplier || '').toUpperCase();
  FORMATTER_MAP[supplierUpper] = formatter;
}

module.exports = {
  getFormatter,
  getAvailableSuppliers,
  registerFormatter
};

