CREATE OR REPLACE TRIGGER trigger_recalculate_order_totals_upd
AFTER UPDATE OF quantity, unit_price, order_id, shipped_quantity ON public.order_items
FOR EACH ROW
WHEN (
  OLD.quantity IS DISTINCT FROM NEW.quantity
  OR OLD.unit_price IS DISTINCT FROM NEW.unit_price
  OR OLD.order_id IS DISTINCT FROM NEW.order_id
  OR OLD.shipped_quantity IS DISTINCT FROM NEW.shipped_quantity
)
EXECUTE FUNCTION public.recalculate_order_totals();