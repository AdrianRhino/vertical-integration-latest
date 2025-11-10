/**
 * Normalize a field's value for saving back to HubSpot.
 *
 * - Multi-select arrays → "value1;value2"
 * - Objects with .value (Select) → .value
 * - Date objects ({ year, month, date }) → "YYYY-MM-DD"
 * - Currency/number inputs → numeric string or null
 * - Checkboxes (booleans) → true/false
 * - Empty strings → null
 *
 * @param {*} val - The raw value from formData
 * @returns {string|boolean|null}
 */
export const normalizeValue = (val) => {
    if (val === undefined || val === null) return null;
  
    // Multi-select (array) → HubSpot string
    if (Array.isArray(val)) {
      return val.length ? val.join(";") : null;
    }
  
    // HubSpot Select or custom dropdown object { label, value }
    if (typeof val === "object" && val !== null && "value" in val) {
      return val.value || null;
    }
  
    // DateInput object → "YYYY-MM-DD"
    if (typeof val === "object" && isDateObject(val)) {
      return convertDateObject(val);
    }
  
    // Boolean (checkbox)
    if (typeof val === "boolean") {
      return val;
    }
  
    // Numbers — keep as string (HubSpot handles type internally)
    if (typeof val === "number") {
      return String(val);
    }
  
    // Strings — trim and empty → null
    if (typeof val === "string") {
      const trimmed = val.trim();
      return trimmed.length ? trimmed : null;
    }
  
    return null;
  };

/**
 * Convert HubSpot date string to DateInput component format
 * @param {string} dateString - Date string from HubSpot (e.g., "2024-01-15")
 * @returns {object|null} - DateInput format { year, month, date } or null if invalid
 */
export const convertToDateInputFormat = (dateString) => {
  if (!dateString || typeof dateString !== 'string') {
    return null;
  }

  try {
    // Handle various date formats from HubSpot
    let date;
    
    // Try parsing as ISO date string (YYYY-MM-DD)
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      date = new Date(dateString + 'T00:00:00');
    } 
    // Try parsing as full ISO string
    else if (dateString.includes('T')) {
      date = new Date(dateString);
    }
    // Try parsing as other common formats
    else {
      date = new Date(dateString);
    }

    // Check if date is valid
    if (isNaN(date.getTime())) {
      console.warn('Invalid date string:', dateString);
      return null;
    }

    return {
      year: date.getFullYear(),
      month: date.getMonth(), // 0-based month
      date: date.getDate()
    };
  } catch (error) {
    console.error('Error converting date string:', dateString, error);
    return null;
  }
};
  
  /** Detect a DateInput-style object */
  const isDateObject = (val) => {
    return (
      val &&
      typeof val.year === "number" &&
      typeof val.month === "number" && // 0-based month
      (typeof val.date === "number" || typeof val.day === "number")
    );
  };
  
  /** Convert date object to "YYYY-MM-DD" */
  const convertDateObject = (val) => {
    try {
      const day = val.date ?? val.day;
      const date = new Date(val.year, val.month, day);
      return date.toISOString().split("T")[0]; // YYYY-MM-DD
    } catch {
      return null;
    }
  };
  