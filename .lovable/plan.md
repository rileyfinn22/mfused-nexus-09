

## Problem

Invoice 10717's blanket has `total = $54,200` in the DB, but the order total is `$271,000`. This happened because the save logic (`blanketTotalItems`) recalculated the total using shipped quantities and overwrote the DB. Four blanket invoices are affected (totals lower than their order):

| Invoice | DB Total | Order Total |
|---------|----------|-------------|
| 10704 | $25,607 | $65,407 |
| 10714 | $202,015 | $327,500 |
| 10717 | $54,200 | $271,000 |
| 10724 | $24,010 | $37,420 |

There are two issues:
1. **DB is corrupted** -- these 4 blankets need their totals restored to the order amount
2. **Save logic will re-corrupt** -- when someone edits shipped quantities and saves, line 1087-1104 recalculates using `blanketTotalItems()` and writes the result to DB. This means if some items haven't shipped yet, it writes a mixed total. It should apply the same MAX(order total, shipped total) rule on save.

## Fix

### 1. Database fix -- restore 4 corrupted blanket invoices

Run an UPDATE to set blanket invoice subtotal/total back to order values WHERE the invoice total is currently lower than the order total (only fixes the "under" cases, doesn't touch legitimate overs):

```sql
UPDATE invoices 
SET subtotal = o.subtotal, total = o.total, tax = o.tax
FROM orders o
WHERE invoices.order_id = o.id
  AND invoices.deleted_at IS NULL
  AND invoices.invoice_type = 'full'
  AND invoices.shipment_number = 1
  AND invoices.total < o.total
```

### 2. Fix save logic in `InvoiceDetail.tsx` (line ~1086-1104)

After computing the shipped-based total, apply the MAX rule before writing to DB:

```typescript
// Recalculate shipped total
const totalItems = blanketTotalItems(editedItems);
const { subtotal: shippedSubtotal, total: shippedTotal } = calculateInvoiceTotals(...);

// For blanket invoices: never save less than the original order total
let newSubtotal = shippedSubtotal;
let newTotal = shippedTotal;
if (invoice.invoice_type === 'full' && invoice.shipment_number === 1 && order) {
  const orderSubtotal = Number(order.subtotal || 0);
  const orderTotal = Number(order.total || 0);
  if (newSubtotal < orderSubtotal) newSubtotal = orderSubtotal;
  if (newTotal < orderTotal) newTotal = orderTotal;
}
```

### 3. Invoices list page (`Invoices.tsx`)

The list page reads `invoice.total` directly from DB (line 752). After fixes #1 and #2, the DB values will be correct, so no change needed here. The `computeDisplayTotals` MAX logic on the detail page also remains correct as a safety net.

### Summary
- One DB update to fix 4 corrupted blankets
- One code change in the save handler to prevent future corruption
- Display logic (already using MAX) stays as-is

