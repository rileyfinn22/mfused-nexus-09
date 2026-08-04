-- Vendor PO totals: one owner, two clearly-defined numbers.
--
--   vendor_pos.total       = the PO we cut and sent the vendor (ORDERED basis).
--                            quantity * unit_cost. Never shipped-adjusted.
--   vendor_pos.final_total = what the vendor actually billed us (BILLED basis).
--                            final_quantity/final_unit_cost when set, else shipped, else ordered.
--                            NULL until the PO actually has a billed basis, so every existing
--                            `final_total ?? total` read site falls back to the ordered PO.
--
-- shipped_quantity = 0 means "nobody recorded a shipment on this line", NOT "the vendor billed
-- us zero for it" -- 274 live lines sit at 0 simply because the sync path never writes a 0
-- (it early-returns on qty <= 0). Billing those at zero understated real POs: 3049 was paid
-- $32,100 but read as $3,600 owed because one 100k-unit line still sat at shipped 0. So a zero
-- falls back to the ordered quantity; only an explicit final_quantity from Update Bill can
-- deliberately bill a line at zero.
--
-- Shipping has two homes in the data: a SHIPPING line item and vendor_pos.shipping_cost.
-- Line item wins when present, column is the fallback. Previously both were added, so any
-- line-item edit on a PO carrying both silently added shipping a second time.

CREATE OR REPLACE FUNCTION public.vendor_po_recalc(target_po_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  ordered_items  NUMERIC := 0;
  billed_items   NUMERIC := 0;
  ordered_ship   NUMERIC := 0;
  billed_ship    NUMERIC := 0;
  po_shipping    NUMERIC := 0;
  has_billed     BOOLEAN := false;
BEGIN
  IF target_po_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    COALESCE(SUM(i.quantity * i.unit_cost)
             FILTER (WHERE NOT is_ship), 0),
    COALESCE(SUM(COALESCE(i.final_quantity, NULLIF(i.shipped_quantity, 0), i.quantity)
                 * COALESCE(i.final_unit_cost, i.unit_cost))
             FILTER (WHERE NOT is_ship), 0),
    COALESCE(SUM(i.quantity * i.unit_cost)
             FILTER (WHERE is_ship), 0),
    COALESCE(SUM(COALESCE(i.final_quantity, NULLIF(i.shipped_quantity, 0), i.quantity)
                 * COALESCE(i.final_unit_cost, i.unit_cost))
             FILTER (WHERE is_ship), 0),
    -- A PO only has a billed basis once someone has actually recorded final figures
    -- or a real shipment. An all-zero/all-null shipped set is "nothing billed yet",
    -- NOT "we owe zero" -- that distinction is what used to zero out live POs.
    COALESCE(BOOL_OR(i.final_quantity IS NOT NULL
                     OR i.final_unit_cost IS NOT NULL
                     OR COALESCE(i.shipped_quantity, 0) > 0), false)
  INTO ordered_items, billed_items, ordered_ship, billed_ship, has_billed
  FROM (
    SELECT i.*,
           (COALESCE(i.sku, '') = 'SHIPPING' OR COALESCE(i.item_type, '') = 'shipping') AS is_ship
    FROM public.vendor_po_items i
    WHERE i.vendor_po_id = target_po_id
  ) i;

  SELECT COALESCE(shipping_cost, 0) INTO po_shipping
  FROM public.vendor_pos
  WHERE id = target_po_id;

  UPDATE public.vendor_pos
  SET total = ROUND((ordered_items + COALESCE(NULLIF(ordered_ship, 0), po_shipping, 0))::numeric, 2),
      final_total = CASE
        WHEN has_billed
          THEN ROUND((billed_items + COALESCE(NULLIF(billed_ship, 0), po_shipping, 0))::numeric, 2)
        ELSE NULL
      END,
      updated_at = now()
  WHERE id = target_po_id;
END;
$function$;

-- Items changed -> recalc the owning PO.
CREATE OR REPLACE FUNCTION public.recalculate_vendor_po_totals()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.vendor_po_recalc(COALESCE(NEW.vendor_po_id, OLD.vendor_po_id));
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- shipping_cost changed on the PO itself -> recalc too. Without this the column could be
-- edited and the stored totals would not move until the next unrelated line-item edit.
CREATE OR REPLACE FUNCTION public.recalculate_vendor_po_on_shipping()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF COALESCE(NEW.shipping_cost, 0) IS DISTINCT FROM COALESCE(OLD.shipping_cost, 0) THEN
    PERFORM public.vendor_po_recalc(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_vendor_po_shipping_recalc ON public.vendor_pos;
CREATE TRIGGER trg_vendor_po_shipping_recalc
AFTER UPDATE OF shipping_cost ON public.vendor_pos
FOR EACH ROW
EXECUTE FUNCTION public.recalculate_vendor_po_on_shipping();

REVOKE EXECUTE ON FUNCTION public.vendor_po_recalc(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalculate_vendor_po_on_shipping() FROM PUBLIC, anon, authenticated;

-- Vendors must never be able to move what they are owed. Both of these are SECURITY DEFINER
-- and were granted to authenticated, and both now feed final_total directly. Zero callers in
-- the app, so revoke rather than drop -- reversible with a one-line GRANT if a caller surfaces.
REVOKE EXECUTE ON FUNCTION public.vendor_update_item_shipped_qty(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.vendor_update_item_final_qty(uuid, integer) FROM PUBLIC, anon, authenticated;

-- Backfill every PO onto the new definitions.
DO $backfill$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.vendor_pos LOOP
    PERFORM public.vendor_po_recalc(r.id);
  END LOOP;
END;
$backfill$;
