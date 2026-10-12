DROP TRIGGER IF EXISTS trigger_recalculate_order_totals ON public.order_items;
CREATE TRIGGER trigger_recalculate_order_totals AFTER INSERT OR DELETE ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.recalculate_order_totals();
CREATE TRIGGER trigger_recalculate_order_totals_upd AFTER UPDATE OF quantity, unit_price, order_id ON public.order_items
FOR EACH ROW WHEN (OLD.quantity IS DISTINCT FROM NEW.quantity OR OLD.unit_price IS DISTINCT FROM NEW.unit_price OR OLD.order_id IS DISTINCT FROM NEW.order_id)
EXECUTE FUNCTION public.recalculate_order_totals();