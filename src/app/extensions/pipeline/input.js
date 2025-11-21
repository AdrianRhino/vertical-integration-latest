// SHAPE: Input → Filter → Transform → Store → Output → Loop
// INPUT: HubSpot deal data, user inputs
// FILTER: Validate inputs exist
// TRANSFORM: Build InternalOrder from inputs
// STORE: Return InternalOrder
// OUTPUT: InternalOrder ready for processing
// LOOP: Can process multiple inputs

import { buildInternalOrder } from "../domain/orderBuilder.js";

/**
 * Input stage: Convert HubSpot data + user inputs → InternalOrder
 * 
 * @param {Object} fullOrder - Full order from HubSpot/UI
 * @param {Object} parsedOrder - Parsed order data
 * @param {Object} crmData - Additional CRM data
 * @returns {{ order: InternalOrder, errors: string[], warnings: string[] }}
 */
export function inputStage(fullOrder, parsedOrder, crmData) {
  return buildInternalOrder(fullOrder, parsedOrder, crmData);
}

