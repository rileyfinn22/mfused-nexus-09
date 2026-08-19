CREATE OR REPLACE FUNCTION public.set_order_item_total()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.total := ROUND((COALESCE(NEW.quantity, 0) * COALESCE(NEW.unit_price, 0))::numeric, 2);
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.set_order_item_total() IS
'order_items.total is a display cache, never a money source: recalculate_order_totals and recalc_blanket_invoices_for_order both compute from quantity and unit_price directly. Left writable it drifted - one line ended up holding a child invoice total, others the shipped basis - and every surface that printed it was wrong in a different way. Deriving it here means it cannot disagree with the row it sits on.';

DROP TRIGGER IF EXISTS trg_set_order_item_total ON public.order_items;
CREATE TRIGGER trg_set_order_item_total
  BEFORE INSERT OR UPDATE OF quantity, unit_price ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.set_order_item_total();

CREATE OR REPLACE FUNCTION public.set_vendor_po_item_total()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.total := ROUND((COALESCE(NEW.quantity, 0) * COALESCE(NEW.unit_cost, 0))::numeric, 2);
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.set_vendor_po_item_total() IS
'vendor_po_items.total is a display cache. vendor_po_recalc computes the PO from quantity x unit_cost and what the vendor billed comes from vendor_bills, so nothing reads this for money. It had drifted on 269 lines because the retired Update Bill flow wrote billed figures into it, which is how the vendor portal PDF came to show a vendor a different total than the admin copy of the same PO.';

DROP TRIGGER IF EXISTS trg_set_vendor_po_item_total ON public.vendor_po_items;
CREATE TRIGGER trg_set_vendor_po_item_total
  BEFORE INSERT OR UPDATE OF quantity, unit_cost ON public.vendor_po_items
  FOR EACH ROW EXECUTE FUNCTION public.set_vendor_po_item_total();

UPDATE public.order_items
SET total = ROUND((COALESCE(quantity, 0) * COALESCE(unit_price, 0))::numeric, 2)
WHERE COALESCE(total, 0) IS DISTINCT FROM ROUND((COALESCE(quantity, 0) * COALESCE(unit_price, 0))::numeric, 2);

UPDATE public.vendor_po_items
SET total = ROUND((COALESCE(quantity, 0) * COALESCE(unit_cost, 0))::numeric, 2)
WHERE COALESCE(total, 0) IS DISTINCT FROM ROUND((COALESCE(quantity, 0) * COALESCE(unit_cost, 0))::numeric, 2);
