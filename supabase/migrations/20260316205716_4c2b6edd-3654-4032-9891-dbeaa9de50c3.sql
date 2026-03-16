CREATE TRIGGER recalculate_vendor_po_totals_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.vendor_po_items
FOR EACH ROW
EXECUTE FUNCTION public.recalculate_vendor_po_totals();