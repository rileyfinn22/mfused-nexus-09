-- Backfill vendor_po_items.shipped_quantity from order_items.shipped_quantity
UPDATE public.vendor_po_items vpi
SET shipped_quantity = COALESCE(oi.shipped_quantity, 0)
FROM public.order_items oi
WHERE vpi.order_item_id = oi.id
  AND oi.shipped_quantity IS NOT NULL
  AND vpi.shipped_quantity IS DISTINCT FROM oi.shipped_quantity;

-- Recalculate vendor PO totals for any POs whose items were touched
UPDATE public.vendor_pos vp
SET total = sub.new_total + COALESCE(vp.shipping_cost, 0),
    updated_at = now()
FROM (
  SELECT vendor_po_id,
         COALESCE(SUM(
           CASE WHEN shipped_quantity > 0 THEN shipped_quantity ELSE quantity END * unit_cost
         ), 0) AS new_total
  FROM public.vendor_po_items
  GROUP BY vendor_po_id
) sub
WHERE vp.id = sub.vendor_po_id;