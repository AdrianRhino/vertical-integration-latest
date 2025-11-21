# Cursor Refactor Plan: Vertical Integration Project

## Goal

Refactor the existing vertical integration system (React + HubSpot UI Extensions) into a simple, config-driven, invariant-preserving architecture—while keeping the current UI and supplier behavior unchanged.

---

## ✅ Step-by-Step Checklist

### ## 1. Inventory what exists


- [ ] Identify all logic that depends on supplier type (ABC, Beacon, SRS)

- [ ] Extract all mappings (HubSpot → supplier)

- [ ] Locate hardcoded delivery defaults, uom normalizers, pricing calls

## 2. Create new structure

- [ ] Create `types/internalOrder.ts` for canonical order shape

- [ ] Create `config/abc.json`, `config/beacon.json`, `config/srs.json`

- [ ] Create `adapters/abcAdapter.ts`, etc.

- [ ] Create `pipeline/` with: `buildInternalOrder.ts`, `validateOrder.ts`, `transformOrder.ts`, `submitOrder.ts`

## 3. Migrate logic to config

- [ ] Move all field and line mappings to `config/*.json`

- [ ] Move default values to `defaults` key

- [ ] Move supplier quirks (e.g., wrappers, time windows, enums) to config

## 4. Normalize to InternalOrder

- [ ] Build `InternalOrder` from HubSpot + user state

- [ ] Normalize line items (`sku`, `qty`, `uom`, `price`, etc.)

- [ ] Coerce all optional fields to safe values

## 5. Enforce invariants

- [ ] Create `checkInvariants.ts`

- [ ] Add guards for required fields, valid enums, pricing state

- [ ] Run checks after input merge and before submission

## 6. Refactor adapters

- [ ] Make all adapters follow `adapter(order: InternalOrder): supplierRequest` shape

- [ ] Load config and transform from `transformOrder(order, config)`

- [ ] Send supplier HTTP request and return `{ success, confirmationId, error }`

## 7. Test safely

- [ ] Wrap new system behind a feature flag (e.g., `USE_TRANS_ARCH = true`)

- [ ] Log new vs old payloads side-by-side for each supplier

- [ ] Start with pricing only, then order submission

- [ ] Validate by submitting test deals in HubSpot

## 8. Review for transcendence

- [ ] Core flow should have no conditionals for supplier

- [ ] Config drives everything but HTTP call

- [ ] Adding a new supplier means: 1 config file + 1 adapter shell🔄 Canonical InternalOrder Type

```ts
export type InternalOrder = {
  supplier: "ABC" | "Beacon" | "SRS"
  accountNumber: string
  branchId: string
  status: "Draft" | "Priced" | "Submitted"
  poNumber?: string
  jobName?: string
  jobNumber?: string
  delivery: {
    method: "Delivery" | "Pickup"
    date: string
    timeCode: string
    fromTime?: string
    toTime?: string
    address: {
      line1: string
      city: string
      state: string
      postalCode: string
    }
    contact: {
      name: string
      phone: string
      email: string
    }
    notes?: string
  }
  lineItems: CanonicalLineItem[]
}

export type CanonicalLineItem = {
  sku: string
  uom: string
  qty: number
  price?: number
  name?: string
  description?: string
  category?: string
}
```

---

## 🧩 Example Config Shape (`abc.json`)

```json
{
  "supplier": "ABC",
  "fieldMappings": {
    "accountNumber": "shipTo.number",
    "branchId": "branchNumber",
    "delivery.date": "dates.deliveryRequestedFor",
    "delivery.timeCode": "deliveryAppointment.instructionsTypeCode"
  },
  "lineItemMappings": {
    "sku": "itemNumber",
    "qty": "orderedQty.value",
    "uom": "orderedQty.uom"
  },
  "defaults": {
    "delivery.fromTime": "07:00",
    "delivery.toTime": "17:00",
    "delivery.timeCode": "AT"
  },
  "wrapRequest": "array",
  "auth": {
    "type": "Bearer",
    "tokenPath": "config/abcToken"
  }
}
```

---

This checklist and structure should help Cursor rewrite the system cleanly, with clarity and confidence. Let me know if you want scaffolding files to accelerate the refactor.
