-- Function to recalculate order totals when order_items change
CREATE OR REPLACE FUNCTION public.recalculate_order_totals()
RETURNS TRIGGER AS $$
DECLARE
  new_subtotal NUMERIC;
  target_order_id UUID;
BEGIN
  -- Get the order_id from either NEW or OLD record
  target_order_id := COALESCE(NEW.order_id, OLD.order_id);
  
  -- Calculate new subtotal from all order items
  SELECT COALESCE(SUM(total), 0) INTO new_subtotal
  FROM public.order_items
  WHERE order_id = target_order_id;
  
  -- Update the order
  UPDATE public.orders
  SET 
    subtotal = new_subtotal,
    total = new_subtotal + COALESCE(shipping_cost, 0) + COALESCE(tax, 0),
    updated_at = now()
  WHERE id = target_order_id;
  
  -- Update any full/blanket invoices linked to this order
  UPDATE public.invoices
  SET 
    subtotal = new_subtotal,
    total = new_subtotal + COALESCE(shipping_cost, 0) + COALESCE(tax, 0),
    updated_at = now()
  WHERE order_id = target_order_id
    AND invoice_type IN ('full', 'blanket')
    AND quickbooks_sync_status IS DISTINCT FROM 'synced';
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger for order_items changes
DROP TRIGGER IF EXISTS trigger_recalculate_order_totals ON public.order_items;
CREATE TRIGGER trigger_recalculate_order_totals
AFTER INSERT OR UPDATE OR DELETE ON public.order_items
FOR EACH ROW
EXECUTE FUNCTION public.recalculate_order_totals();

-- Function to recalculate vendor PO totals when vendor_po_items change
CREATE OR REPLACE FUNCTION public.recalculate_vendor_po_totals()
RETURNS TRIGGER AS $$
DECLARE
  new_total NUMERIC;
  target_po_id UUID;
BEGIN
  -- Get the vendor_po_id from either NEW or OLD record
  target_po_id := COALESCE(NEW.vendor_po_id, OLD.vendor_po_id);
  
  -- Calculate new total from all PO items
  SELECT COALESCE(SUM(total), 0) INTO new_total
  FROM public.vendor_po_items
  WHERE vendor_po_id = target_po_id;
  
  -- Update the vendor PO
  UPDATE public.vendor_pos
  SET 
    total = new_total,
    updated_at = now()
  WHERE id = target_po_id;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger for vendor_po_items changes
DROP TRIGGER IF EXISTS trigger_recalculate_vendor_po_totals ON public.vendor_po_items;
CREATE TRIGGER trigger_recalculate_vendor_po_totals
AFTER INSERT OR UPDATE OR DELETE ON public.vendor_po_items
FOR EACH ROW
EXECUTE FUNCTION public.recalculate_vendor_po_totals();