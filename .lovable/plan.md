

## Fix: Blanket Invoice Total Logic + Invoice 10708 Data Correction

### Problem
Invoice 10708 stores subtotal=$56,181.90 and total=$64,806.90, but the correct shipped-quantity calculation gives **subtotal=$54,361.60** and **total=$62,986.60** ($54,361.60 + $8,625 shipping).

The root cause: `blanketTotalItems()` falls back to ordered `quantity` for items with 0 shipped, inflating the subtotal. The DB trigger uses `GREATEST(ordered, shipped)` which can also inflate.

### Design Rule
- **Before any shipping**: blanket invoice total = order total (placeholder)  
- **Once any item ships**: blanket subtotal = sum of ONLY shipped items (shipped_qty × unit_price); unshipped items contribute $0  
- **Total** = subtotal + tax + shipping (as always)

### Changes

**1. Data fix — Invoice 10708**  
Update stored values: `subtotal = 54361.60`, `total = 62986.60`

**2. `src/lib/invoiceTotals.ts` — Fix `blanketTotalItems()`**  
If ANY item has `shipped_quantity > 0`, only include items that have shipped. Unshipped items get quantity=0. If NO items have shipped, fall back to ordered quantities (placeholder behavior).

```
blanketTotalItems(orderItems):
  anyShipped = orderItems.some(i => shipped_quantity > 0)
  if anyShipped:
    quantity = shipped_quantity > 0 ? shipped_quantity : 0  // exclude unshipped
  else:
    quantity = ordered quantity  // placeholder
```

**3. `src/pages/InvoiceDetail.tsx` (~lines 1197-1204) — Remove floor-to-order guard**  
The placeholder behavior is now handled by `blanketTotalItems`. Remove the `!anyShipped` floor-to-order logic since the new `blanketTotalItems` already returns ordered quantities when nothing has shipped.

**4. DB trigger migration — `recalculate_order_totals()`**  
Update the blanket invoice subtotal logic:
- If any `shipped_quantity > 0` exists → blanket subtotal = `SUM(shipped_quantity * unit_price)` for shipped items only
- If nothing shipped → keep ordered subtotal as placeholder (`SUM(quantity * unit_price)`)
- Remove `GREATEST(ordered, shipped)` — it inflates totals when some items ship more than ordered while others haven't shipped

