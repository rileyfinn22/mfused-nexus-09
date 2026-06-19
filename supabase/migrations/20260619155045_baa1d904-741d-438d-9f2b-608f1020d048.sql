-- Propagate shipped_quantity from order_items to vendor_po_items so vendor bills reflect actual shipped amounts.
CREATE OR REPLACE FUNCTION public.sync_vendor_po_items_shipped_qty()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.shipped_quantity IS DISTINCT FROM OLD.shipped_quantity THEN
    UPDATE public.vendor_po_items
    SET shipped_quantity = COALESCE(NEW.shipped_quantity, 0)
    WHERE order_item_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_vendor_po_items_shipped_qty ON public.order_items;
CREATE TRIGGER trg_sync_vendor_po_items_shipped_qty
AFTER UPDATE OF shipped_quantity ON public.order_items
FOR EACH ROW
EXECUTE FUNCTION public.sync_vendor_po_items_shipped_qty();