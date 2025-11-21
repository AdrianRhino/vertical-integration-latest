// SHAPE: Input → Filter → Transform → Store → Output → Loop
// INPUT: Log data
// FILTER: Format log entry
// TRANSFORM: Add metadata (timestamp, context)
// STORE: Output to console/logging service
// OUTPUT: Structured log entry
// LOOP: Can log multiple entries

/**
 * Structured logging for diagnostics
 * Logs all failures with full context for debugging
 */

/**
 * Log order processing event
 * 
 * @param {string} level - Log level ("info", "warn", "error")
 * @param {string} message - Log message
 * @param {Object} context - Additional context data
 */
export function logOrderEvent(level, message, context = {}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
  };
  
  // In production, this would send to logging service
  // For now, use console
  switch (level) {
    case "error":
      console.error("Order Event:", JSON.stringify(logEntry, null, 2));
      break;
    case "warn":
      console.warn("Order Event:", JSON.stringify(logEntry, null, 2));
      break;
    default:
      console.log("Order Event:", JSON.stringify(logEntry, null, 2));
  }
  
  return logEntry;
}

/**
 * Log invariant violation
 * 
 * @param {Object} order - InternalOrder
 * @param {string} supplier - Supplier name
 * @param {Object} violation - Violation details
 * @param {Object} payload - Payload that caused violation (optional)
 * @param {Object} response - API response (optional)
 */
export function logInvariantViolation(order, supplier, violation, payload = null, response = null) {
  return logOrderEvent("error", "Invariant violation", {
    orderId: order.orderId || order.requestId,
    supplier,
    invariantViolated: violation.field || violation.code,
    context: {
      field: violation.field,
      value: violation.value,
      message: violation.message,
    },
    payload: payload ? JSON.stringify(payload).substring(0, 500) : null,
    response: response ? {
      status: response.status,
      statusText: response.statusText,
      body: response.data ? JSON.stringify(response.data).substring(0, 500) : null,
    } : null,
  });
}

/**
 * Log order submission
 * 
 * @param {Object} order - InternalOrder
 * @param {string} supplier - Supplier name
 * @param {Object} result - Submission result
 */
export function logOrderSubmission(order, supplier, result) {
  return logOrderEvent(result.success ? "info" : "error", "Order submission", {
    orderId: order.orderId || order.requestId,
    supplier,
    success: result.success,
    confirmationId: result.confirmationId,
    error: result.error,
  });
}

