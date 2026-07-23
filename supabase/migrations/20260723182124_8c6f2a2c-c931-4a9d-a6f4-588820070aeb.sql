DROP TRIGGER IF EXISTS trigger_recalculate_vendor_po_totals ON public.vendor_po_items;
-- Fix any POs that were doubled by the duplicate trigger
UPDATE public.vendor_pos p SET total = sub.items_sum
FROM (
  SELECT vendor_po_id, COALESCE(SUM(total),0) AS items_sum
  FROM public.vendor_po_items
  GROUP BY vendor_po_id
) sub
WHERE p.id = sub.vendor_po_id
  AND ROUND(p.total::numeric, 2) <> ROUND(sub.items_sum::numeric, 2);