CREATE OR REPLACE FUNCTION public.remove_unsent_po_lines_for_order_item()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.vendor_po_items i
  USING public.vendor_pos v
  WHERE i.vendor_po_id = v.id
    AND i.order_item_id = OLD.id
    AND coalesce(v.status,'draft') IN ('draft','created');
  RETURN OLD;
END $$;
REVOKE EXECUTE ON FUNCTION public.remove_unsent_po_lines_for_order_item() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_remove_unsent_po_lines ON public.order_items;
CREATE TRIGGER trg_remove_unsent_po_lines BEFORE DELETE ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.remove_unsent_po_lines_for_order_item();