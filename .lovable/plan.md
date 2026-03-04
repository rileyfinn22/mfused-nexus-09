
Goal: make invoice totals come from the invoice line-item section logic only, and stop packing-list flow from using separate math.

1) Align the source of truth for totals
- Create one shared invoice-total calculator (used by both Invoice Detail and Packing List save flow).
- Inputs: current invoice type, line items shown for that invoice, shipped/allocated quantity basis, unit price, shipping, tax.
- Output: subtotal + total.
- This removes the current split logic where each screen recalculates differently.

2) Fix packing-list save behavior (current root issue)
- In `InvoicePackingListSection.tsx`, keep packing-list upload/parsing + shipped quantity/allocation updates.
- Replace the current local subtotal logic in `applyShippedQuantities` with the shared calculator.
- Remove “all order items blanket math” branch that bypasses invoice section logic.
- Always persist totals (including zero), not only when subtotal > 0.

3) Fix Invoice Detail math consistency
- In `InvoiceDetail.tsx`, use the same shared calculator for:
  - on-screen totals,
  - save action (`handleSaveQuantities`),
  - any shipped-qty updates.
- Remove SKU-based lookups for quantity math (use order-item id to avoid collisions/mis-pairing).
- Keep line total = quantity basis used by invoice section × unit price, so row totals and footer totals always match.

4) Prevent unrelated order-level corruption
- In `handleSaveQuantities`, stop recalculating/updating parent order financial totals from invoice edit state (this is currently mixing invoice edits into order totals).
- Limit save scope to invoice totals + shipped/allocation data relevant to the invoice.

5) Data correction for already-affected invoices
- Run a one-time backend recalculation for mismatched invoices (including 10708) using the same shared formula so invoice tile totals and invoice detail totals match immediately.

Technical details
- Files to update:
  - `src/components/InvoicePackingListSection.tsx`
  - `src/pages/InvoiceDetail.tsx`
  - (optional helper) `src/lib/invoiceTotals.ts`
- No schema/RLS changes needed.
- Regression checks:
  - Upload packing list with apply shipped ON: totals update to invoice-section math only.
  - Manual shipped edit + save: totals match line items exactly.
  - Invoice list amount equals invoice detail total for the same invoice.
  - Verify invoice 10708 and 10748 specifically after backfill.
