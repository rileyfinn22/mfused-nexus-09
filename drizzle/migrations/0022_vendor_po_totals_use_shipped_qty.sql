CREATE OR REPLACE FUNCTION public.set_vendor_po_item_total()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  NEW.total := ROUND((
    CASE WHEN COALESCE(NEW.shipped_quantity,0) > 0 THEN NEW.shipped_quantity ELSE COALESCE(NEW.quantity,0) END
    * COALESCE(NEW.unit_cost, 0))::numeric, 2);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_set_vendor_po_item_total ON public.vendor_po_items;
CREATE TRIGGER trg_set_vendor_po_item_total BEFORE INSERT OR UPDATE OF quantity, unit_cost, shipped_quantity ON public.vendor_po_items FOR EACH ROW EXECUTE FUNCTION public.set_vendor_po_item_total();

CREATE OR REPLACE FUNCTION public.vendor_po_recalc(target_po_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  ordered_items NUMERIC := 0; ordered_ship NUMERIC := 0; po_shipping NUMERIC := 0;
  bill_count INTEGER := 0; bill_total NUMERIC := 0;
BEGIN
  IF target_po_id IS NULL THEN RETURN; END IF;
  SELECT
    COALESCE(SUM(i.eff_qty * i.unit_cost) FILTER (WHERE NOT is_ship), 0),
    COALESCE(SUM(i.eff_qty * i.unit_cost) FILTER (WHERE is_ship), 0)
  INTO ordered_items, ordered_ship
  FROM (
    SELECT i.unit_cost,
           CASE WHEN COALESCE(i.shipped_quantity,0) > 0 THEN i.shipped_quantity ELSE COALESCE(i.quantity,0) END AS eff_qty,
           (COALESCE(i.sku, '') = 'SHIPPING' OR COALESCE(i.item_type, '') = 'shipping') AS is_ship
    FROM public.vendor_po_items i WHERE i.vendor_po_id = target_po_id
  ) i;
  SELECT COALESCE(shipping_cost, 0) INTO po_shipping FROM public.vendor_pos WHERE id = target_po_id;
  SELECT COUNT(*), COALESCE(SUM(total), 0) INTO bill_count, bill_total
  FROM public.vendor_bills WHERE vendor_po_id = target_po_id AND status = 'final';
  UPDATE public.vendor_pos
  SET total = ROUND((ordered_items + COALESCE(NULLIF(ordered_ship, 0), po_shipping, 0))::numeric, 2),
      final_total = CASE WHEN bill_count > 0 THEN ROUND(bill_total::numeric, 2) ELSE NULL END,
      updated_at = now()
  WHERE id = target_po_id;
END;
$function$;

UPDATE public.vendor_po_items SET total = ROUND((CASE WHEN COALESCE(shipped_quantity,0) > 0 THEN shipped_quantity ELSE COALESCE(quantity,0) END * COALESCE(unit_cost,0))::numeric, 2)
WHERE COALESCE(shipped_quantity,0) > 0 AND shipped_quantity <> quantity;