CREATE OR REPLACE FUNCTION public.vendor_po_recalc(target_po_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  ordered_items  NUMERIC := 0;
  ordered_ship   NUMERIC := 0;
  po_shipping    NUMERIC := 0;
  bill_count     INTEGER := 0;
  bill_total     NUMERIC := 0;
BEGIN
  IF target_po_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    COALESCE(SUM(i.quantity * i.unit_cost) FILTER (WHERE NOT is_ship), 0),
    COALESCE(SUM(i.quantity * i.unit_cost) FILTER (WHERE is_ship), 0)
  INTO ordered_items, ordered_ship
  FROM (
    SELECT i.*,
           (COALESCE(i.sku, '') = 'SHIPPING' OR COALESCE(i.item_type, '') = 'shipping') AS is_ship
    FROM public.vendor_po_items i
    WHERE i.vendor_po_id = target_po_id
  ) i;

  SELECT COALESCE(shipping_cost, 0) INTO po_shipping
  FROM public.vendor_pos
  WHERE id = target_po_id;

  SELECT COUNT(*), COALESCE(SUM(total), 0)
  INTO bill_count, bill_total
  FROM public.vendor_bills
  WHERE vendor_po_id = target_po_id;

  UPDATE public.vendor_pos
  SET total = ROUND((ordered_items + COALESCE(NULLIF(ordered_ship, 0), po_shipping, 0))::numeric, 2),
      final_total = CASE
        WHEN bill_count > 0 THEN ROUND(bill_total::numeric, 2)
        ELSE NULL
      END,
      updated_at = now()
  WHERE id = target_po_id;
END;
$function$;

COMMENT ON FUNCTION public.vendor_po_recalc(uuid) IS
'Owns both money columns on a vendor PO. total is always the order we placed: quantity x unit_cost, with freight taken from a SHIPPING line when there is one and the shipping_cost column otherwise. final_total is what the vendor actually billed and is derived from attached vendor_bills ONLY - it is NULL until a bill exists, so every final_total ?? total read site falls back to the ordered PO. Final and shipped quantities recorded on the PO lines are kept as history but no longer produce a billed figure: a PO stands as a PO until a bill is attached.';

SELECT public.vendor_po_recalc(id) FROM public.vendor_pos;
