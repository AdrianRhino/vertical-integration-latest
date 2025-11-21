// SHAPE: Input → Filter → Transform → Store → Output → Loop
// INPUT: Error code definitions
// FILTER: N/A
// TRANSFORM: N/A
// STORE: Error code constants
// OUTPUT: Exported error codes
// LOOP: Error codes used throughout system

/**
 * Error code definitions
 * Used for invariant checking and error reporting
 */
export const ERROR_CODES = {
  SCHEMA_MISMATCH: "SCHEMA_MISMATCH",
  MISSING_FIELD: "MISSING_FIELD",
  ENUM_UNMAPPED: "ENUM_UNMAPPED",
  SUPPLIER_REJECT: "SUPPLIER_REJECT",
  NETWORK_ERROR: "NETWORK_ERROR",
  AUTH_FAILURE: "AUTH_FAILURE",
};

/**
 * Error messages for each code
 */
export const ERROR_MESSAGES = {
  [ERROR_CODES.SCHEMA_MISMATCH]: "Field type or structure invalid",
  [ERROR_CODES.MISSING_FIELD]: "Required field not present",
  [ERROR_CODES.ENUM_UNMAPPED]: "Invalid value for mapped enum",
  [ERROR_CODES.SUPPLIER_REJECT]: "Supplier API returned error",
  [ERROR_CODES.NETWORK_ERROR]: "Network connection error",
  [ERROR_CODES.AUTH_FAILURE]: "Authentication failed",
};

