
export const deliveryComponent = [
    {
      label: "Select a delivery date:",
      type: "dateInput",
      required: false,
      internalName: "delivery_date",
      placeholder: "Delivery Date",
      view: true,
      script: "",
    },
    {
      label: "Delivery Service Type",
      type: "dropdown",
      required: false,
      options: [
        { label: "Rooftop Delivery", value: "roofDrop" },
        { label: "Ground Drop Delivery", value: "groundDrop" },
        { label: "Roof Edge Delivery", value: "edgeDrop" }
      ],
      internalName: "delivery_type",
      placeholder: "test",
      view: true,
      script: "",
    },
    {
      label: "Delivery Time Code",
      type: "dropdown",
      required: false,
      options: [
        { label: "Anytime Delivery (AT)", value: "anytime" },
        { label: "AM Delivery", value: "am" },
        { label: "PM Delivery", value: "pm" },
      ],
      internalName: "time_code",
      placeholder: "test",
      view: true,
      script: "",
    },
    {
      label: "Delivery Instructions",
      type: "multiline",
      required: false,
      internalName: "delivery_instructions",
      placeholder: "test",
      view: true,
      script: "",
    },
  ];

  export const moneyFormatter = (type, price, qty) => {
    if (type === 'unitPrice') {
      const formattedPrice = Number(price).toFixed(2);
    return formattedPrice;
    } else if (type === 'linePrice') {
      const formattedPrice = ((Number(qty) || 0) * (Number(price) || 0)).toFixed(2);
    return formattedPrice;
    }
  }

  export const units = 
  {
    "BNDL": { "label": "BNDL", "toolTip": "Bundles", "factor": 0.3333, value: "BNDL" },
    "SQ":   { "label": "SQ", "toolTip": "Squares", "factor": 1, value: "SQ" },
    "EA":   { "label": "EA", "toolTip": "Each",    "factor": 1, value: "EA" },
    "LF":   { "label": "LF", "toolTip": "Linear Ft.", "factor": 1, value: "LF" },
    "RL":   { "label": "RL", "toolTip": "Roll", "factor": 1, value: "RL" },
    "BX":   { "label": "BX", "toolTip": "Box", "factor": 1, value: "BX" }
  }

  export function parseLineItemsFromString(input) {
    // Handle undefined, null, or empty input
    if (!input || input === 'undefined' || input === 'null') {
      return { lines: [], errors: ["No payload data available"] };
    }
    
    try {
      const first = JSON.parse(String(input).trim());
      const data = (typeof first === "string") ? JSON.parse(first) : first;
  
    if (!Array.isArray(data)) throw new Error("Expected an array of line items");
  
 
    const lines = [];

    const errors = [];
  
    (data).forEach((item, idx) => {
      const where = `item[${idx}]`;
      const sku = (item?.sku ?? "").toString().trim();
      const uomRaw = (item?.uom ?? "EA").toString().trim();
      const uom = uomRaw.toUpperCase(); // canonicalize
      const qtyNum = Number(item?.qty);
      const priceNum = item?.price != null ? Number(item.price) : undefined;
  
      let ok = true;
      if (!sku) { errors.push(`${where}: sku is required`); ok = false; }
      if (!uom) { errors.push(`${where}: uom is required`); ok = false; }
      if (!Number.isFinite(qtyNum) || qtyNum <= 0) { errors.push(`${where}: qty must be > 0`); ok = false; }
  
      if (ok) {
        const line = { sku, uom, qty: qtyNum };
        if (priceNum != null && Number.isFinite(priceNum)) line.price = priceNum;
        lines.push(line);
      }
    });
  
    return { lines, errors };
    
    } catch (error) {
      return { 
        lines: [], 
        errors: [`Failed to parse payload: ${error.message}`] 
      };
    }
  }

export function toSentenceCase(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}
