# Vertical Integration Architecture

## Overview

This system follows a **recursive simplicity** architecture where all order processing emerges from 4 composable primitives, similar to how DNA's 4 bases create all life.

## The "4 Bases" (Primitive Operations)

All order processing reduces to these 4 composable primitives:

1. **Accessor** - Get value from nested object using dot path
2. **Normalizer** - Convert value to standard format (dates, strings, numbers)
3. **Validator** - Check if value meets rules
4. **Formatter** - Convert value to target format

**Composition Rule**: These 4 primitives compose to create all functionality:
- **Extractor** = Accessor + Normalizer
- **Transformer** = Accessor + Normalizer + Formatter
- **Field Builder** = Accessor + Normalizer + Validator + Formatter
- **Order Builder** = Multiple Field Builders composed
- **Supplier Adapter** = Order Builder + Supplier-specific Formatters

## Core Data Model

### InternalOrder (Canonical Shape)

All orders flow through the `InternalOrder` shape before being transformed to supplier-specific formats. This is the single source of truth.

```javascript
{
  supplier: "ABC" | "Beacon" | "SRS",
  accountNumber: string,
  branchId: string,
  status: "Draft" | "Priced" | "Submitted",
  poNumber?: string,
  jobName?: string,
  jobNumber?: string,
  delivery: {
    method: "Delivery" | "Pickup",
    date: string, // YYYY-MM-DD
    timeCode: string,
    fromTime?: string,
    toTime?: string,
    address: { line1, city, state, postalCode },
    contact: { name, phone, email },
    notes?: string
  },
  lineItems: CanonicalLineItem[]
}
```

## Pipeline: Input → Filter → Transform → Store → Output → Loop

| Stage | Description | File |
|-------|-------------|------|
| **Input** | HubSpot Deal + User inputs → InternalOrder | `pipeline/input.js` |
| **Filter** | Validate, sanitize, merge data | `pipeline/filter.js` |
| **Transform** | Apply defaults, normalize types | `pipeline/transform.js` |
| **Store** | Save InternalOrder to HubSpot | `pipeline/store.js` |
| **Output** | InternalOrder → supplier payload | `pipeline/output.js` |
| **Loop** | Update order with response | (in adapters) |

## Configuration-Driven

All supplier-specific logic lives in JSON config files:

- `config/abc.json` - ABC Supply configuration
- `config/beacon.json` - Beacon Building Products configuration
- `config/srs.json` - SRS Distribution configuration

Each config defines:
- `fieldMappings` - Maps InternalOrder fields → supplier field paths
- `lineItemMappings` - Maps canonical line items → supplier format
- `defaults` - Default values for missing optional fields
- `enumMappings` - Maps canonical enums → supplier-specific values
- `wrapper` - Wraps payload (e.g., ABC wraps in array)

## Adding a New Supplier

To add a new supplier:

1. Create `config/newSupplier.json` with field mappings, defaults, etc.
2. Create `adapters/newSupplierAdapter.js` extending `BaseAdapter`
3. Register in `adapters/adapterRegistry.js`

That's it! No changes to core logic needed.

## Usage Example

```javascript
import { inputStage } from "./pipeline/input.js";
import { filterStage } from "./pipeline/filter.js";
import { getAdapter } from "./adapters/adapterRegistry.js";

// Build InternalOrder
const { order, errors } = inputStage(fullOrder, parsedOrder, {});

// Validate
const { order: validatedOrder, errors: filterErrors } = filterStage(order);

// Transform to supplier format
const adapter = getAdapter("ABC", "sandbox");
const payload = adapter.transform(validatedOrder);

// Submit (via serverless function)
const response = await hubspot.serverless("abcOrderSandbox", {
  parameters: { orderBody: payload }
});
```

## File Structure

```
/extensions/
  /domain/
    primitives.js          # The 4 base operations
    internalOrder.js       # Type definitions
    orderBuilder.js        # Builds InternalOrder from inputs
  /config/
    abc.json              # ABC supplier config
    beacon.json           # Beacon supplier config
    srs.json              # SRS supplier config
  /adapters/
    baseAdapter.js        # Base adapter interface
    abcAdapter.js         # ABC adapter
    beaconAdapter.js      # Beacon adapter
    srsAdapter.js         # SRS adapter
    adapterRegistry.js    # Registry to get adapters
  /pipeline/
    input.js              # Input stage
    filter.js             # Filter stage
    transform.js          # Transform stage
    store.js              # Store stage
    output.js             # Output stage
    transformToSupplier.js # Core transformation engine
  /invariants/
    checkInvariants.js    # Invariant checking
    errorCodes.js         # Error code definitions
  /utils/
    configLoader.js       # Config loading
    logger.js             # Structured logging
```

## Principles

1. **Recursive Simplicity**: All functionality emerges from 4 primitives
2. **Config-Driven**: All supplier-specific logic in JSON configs
3. **Self-Healing**: Missing data gets safe defaults, never crashes
4. **Invariant-Guarded**: Every transformation step is validated
5. **Composable**: Primitives combine to create complex behavior
6. **Preserve Behavior**: External API payloads remain identical

