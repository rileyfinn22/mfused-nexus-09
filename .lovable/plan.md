

## Problem

The `blanketTotalItems()` function in `src/lib/invoiceTotals.ts` always uses `shipped_quantity`, falling back to 0 when it hasn't been set. This means:

- New orders with `shipped_quantity = 0` show $0 invoice totals
- Saving an invoice in edit mode overwrites the DB total with $0
- The display calculation in `computeDisplayTotals()` also hits this same issue

The desired behavior: **use `shipped_quantity` only when it's been explicitly updated (> 0); otherwise fall back to the original `quantity`**.

## Changes

### 1. Update `blanketTotalItems()` in `src/lib/invoiceTotals.ts`

Change the quantity logic from:
```ts
quantity: Number(item.shipped_quantity || 0)
```
to:
```ts
quantity: Number(item.shipped_quantity || 0) > 0 
  ? Number(item.shipped_quantity) 
  : Number(item.quantity || 0)
```

This means the function now accepts items with both `shipped_quantity` and `quantity` fields and picks the right one.

### 2. Update `computeDisplayTotals()` in `src/pages/InvoiceDetail.tsx` (~line 1438-1444)

The blanket display path manually builds quantity from `shipped_quantity || 0`. Apply the same fallback:
```ts
const shippedQty = Number(orderItem?.shipped_quantity || item.shipped_quantity || 0);
return {
  quantity: shippedQty > 0 ? shippedQty : Number(item.quantity || 0),
  unit_price: Number(item.unit_price || 0),
};
```

### 3. Verify partial/child invoice logic is unaffected

Partial invoices use `partialTotalItems()` which reads `item.quantity` (set to `quantity_allocated` from inventory_allocations). This path is correct and unchanged -- allocations are only created when items are actually shipped/pulled, so their quantities are always meaningful.

### What stays the same
- The save logic on ~line 1087 already calls `blanketTotalItems(editedItems)` -- with the fix above, it will correctly use order quantity as fallback for unshipped items
- Partial/child invoice creation in `pullShipApproval.ts` is unaffected (it uses actual pull quantities)
- The edit mode shipped_quantity fields remain fully functional -- once a user updates shipped_qty to a non-zero value, that value is used for totals

