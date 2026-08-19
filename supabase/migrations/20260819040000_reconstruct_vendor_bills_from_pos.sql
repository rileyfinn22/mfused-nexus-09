INSERT INTO public.vendor_bills (vendor_po_id, company_id, subtotal, freight, total, currency, notes)
WITH li AS (
  SELECT
    i.vendor_po_id,
    (COALESCE(i.sku, '') = 'SHIPPING' OR COALESCE(i.item_type, '') = 'shipping') AS is_ship,
    COALESCE(i.final_quantity, NULLIF(i.shipped_quantity, 0), i.quantity)
      * COALESCE(i.final_unit_cost, i.unit_cost) AS billed_amt,
    (i.final_quantity IS NOT NULL OR i.final_unit_cost IS NOT NULL) AS deliberate
  FROM public.vendor_po_items i
),
agg AS (
  SELECT
    p.id,
    p.company_id,
    COALESCE(p.shipping_cost, 0) AS ship_col,
    COALESCE(SUM(li.billed_amt) FILTER (WHERE NOT li.is_ship), 0) AS billed_items,
    COALESCE(SUM(li.billed_amt) FILTER (WHERE li.is_ship), 0)     AS billed_ship,
    BOOL_OR(li.deliberate) AS deliberate
  FROM public.vendor_pos p
  JOIN li ON li.vendor_po_id = p.id
  WHERE p.final_total IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.vendor_bills b WHERE b.vendor_po_id = p.id)
  GROUP BY p.id, p.company_id, p.shipping_cost
)
SELECT
  agg.id,
  agg.company_id,
  ROUND(agg.billed_items::numeric, 2),
  ROUND(COALESCE(NULLIF(agg.billed_ship, 0), agg.ship_col, 0)::numeric, 2),
  ROUND((agg.billed_items + COALESCE(NULLIF(agg.billed_ship, 0), agg.ship_col, 0))::numeric, 2),
  'USD',
  'Reconstructed from final quantities and costs recorded directly on this PO before vendor_bills existed. Not taken from a vendor document, and no invoice number or bill date is known. Value is identical to what vendor_po_recalc already derived, so no figure changed. If the real vendor invoice turns up, REPLACE this row rather than adding a second bill: bills on a PO are summed.'
FROM agg
WHERE agg.deliberate;
