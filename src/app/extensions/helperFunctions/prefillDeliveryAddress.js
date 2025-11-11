import addressPrefillConfig from "../config/addressPrefill.json";

// SHAPE: Input → Filter → Transform → Store → Output → Loop
// INPUT: { delivery, crm }
// FILTER: ignore fields already filled or missing in CRM data
// TRANSFORM: map CRM values into delivery keys using config
// STORE: return merged delivery object (no side effects)
// OUTPUT: { delivery, applied, touched }
// LOOP: callable whenever fresh CRM data arrives

const fieldMap = addressPrefillConfig?.deliveryFieldMap || {};

export function prefillDeliveryAddress({ delivery = {}, crm = {} } = {}) {
  const nextDelivery = { ...delivery };
  const applied = {};

  for (const [deliveryKey, crmKey] of Object.entries(fieldMap)) {
    if (!isBlank(nextDelivery[deliveryKey])) continue;
    const sourceValue = crmKey ? crm?.[crmKey] : undefined;
    if (isBlank(sourceValue)) continue;
    nextDelivery[deliveryKey] = sourceValue;
    applied[deliveryKey] = sourceValue;
  }

  const touched = Object.keys(applied).length > 0;
  return { delivery: nextDelivery, applied, touched };
}

function isBlank(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  return false;
}


