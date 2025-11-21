// SHAPE: Input → Filter → Transform → Store → Output → Loop
// INPUT: Supplier name, environment
// FILTER: Validate supplier exists
// TRANSFORM: Load appropriate adapter
// STORE: Return adapter instance
// OUTPUT: Adapter ready for use
// LOOP: Registry can provide adapters for multiple suppliers

import { ABCAdapter } from "./abcAdapter.js";
import { BeaconAdapter } from "./beaconAdapter.js";
import { SRSAdapter } from "./srsAdapter.js";

/**
 * Adapter registry
 * Maps supplier names to adapter classes
 */
const ADAPTER_MAP = {
  ABC: ABCAdapter,
  BEACON: BeaconAdapter,
  SRS: SRSAdapter,
};

/**
 * Get adapter for a supplier
 * 
 * @param {string} supplier - Supplier name
 * @param {string} environment - Environment ("production", "sandbox", "dev")
 * @returns {BaseAdapter} Adapter instance
 */
export function getAdapter(supplier, environment = "production") {
  const supplierUpper = String(supplier || "").toUpperCase();
  const AdapterClass = ADAPTER_MAP[supplierUpper];
  
  if (!AdapterClass) {
    throw new Error(`No adapter found for supplier: ${supplier}`);
  }
  
  return new AdapterClass(environment);
}

/**
 * Get all available suppliers
 * @returns {string[]} Array of supplier names
 */
export function getAvailableSuppliers() {
  return Object.keys(ADAPTER_MAP);
}

