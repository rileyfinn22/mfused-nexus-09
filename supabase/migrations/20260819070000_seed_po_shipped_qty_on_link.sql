CREATE OR REPLACE FUNCTION public.seed_vendor_po_item_shipped_qty()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.order_item_id IS NOT NULL AND COALESCE(NEW.shipped_quantity, 0) = 0 THEN
    SELECT COALESCE(oi.shipped_quantity, 0)
    INTO NEW.shipped_quantity
    FROM public.order_items oi
    WHERE oi.id = NEW.order_item_id;
  END IF;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.seed_vendor_po_item_shipped_qty() IS
'Companion to sync_vendor_po_items_shipped_qty, which only fires on UPDATE OF order_items.shipped_quantity. A PO line linked to an order item that had already shipped would otherwise never pick the figure up, so seed it when the link is made. Shipped quantities on a PO are informational only - what the vendor billed comes from vendor_bills, never from these.';

DROP TRIGGER IF EXISTS trg_seed_vendor_po_item_shipped_qty ON public.vendor_po_items;
CREATE TRIGGER trg_seed_vendor_po_item_shipped_qty
  BEFORE INSERT OR UPDATE OF order_item_id ON public.vendor_po_items
  FOR EACH ROW EXECUTE FUNCTION public.seed_vendor_po_item_shipped_qty();

UPDATE public.vendor_po_items vp
SET shipped_quantity = oi.shipped_quantity
FROM public.order_items oi
WHERE oi.id = vp.order_item_id
  AND COALESCE(oi.shipped_quantity, 0) > 0
  AND COALESCE(vp.shipped_quantity, 0) IS DISTINCT FROM COALESCE(oi.shipped_quantity, 0);
