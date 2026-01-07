-- Drop existing trigger first
DROP TRIGGER IF EXISTS trigger_recalculate_order_totals ON order_items;
DROP FUNCTION IF EXISTS recalculate_order_totals();

-- Create improved function that also updates blanket invoice when shipped amounts exceed ordered
CREATE OR REPLACE FUNCTION recalculate_order_totals()
RETURNS TRIGGER AS $$
DECLARE
  v_order_id uuid;
  v_new_subtotal numeric;
  v_new_total numeric;
  v_shipped_subtotal numeric;
  v_blanket_subtotal numeric;
BEGIN
  -- Get the order_id from the affected row
  IF TG_OP = 'DELETE' THEN
    v_order_id := OLD.order_id;
  ELSE
    v_order_id := NEW.order_id;
  END IF;
  
  -- Calculate subtotal from order items based on ORDERED quantities
  SELECT COALESCE(SUM(quantity * unit_price), 0)
  INTO v_new_subtotal
  FROM order_items
  WHERE order_id = v_order_id;
  
  -- Calculate subtotal from order items based on SHIPPED quantities
  SELECT COALESCE(SUM(shipped_quantity * unit_price), 0)
  INTO v_shipped_subtotal
  FROM order_items
  WHERE order_id = v_order_id;
  
  -- The blanket subtotal should be the GREATER of ordered vs shipped
  v_blanket_subtotal := GREATEST(v_new_subtotal, v_shipped_subtotal);
  
  -- Update the order with ORDERED amounts (order represents what was ordered)
  UPDATE orders
  SET subtotal = v_new_subtotal,
      total = v_new_subtotal + COALESCE(tax, 0) + COALESCE(shipping_cost, 0),
      updated_at = now()
  WHERE id = v_order_id;
  
  -- Update full/blanket invoices with the GREATER of ordered vs shipped
  -- Only if not already synced to QuickBooks
  UPDATE invoices
  SET subtotal = v_blanket_subtotal,
      total = v_blanket_subtotal + COALESCE(tax, 0) + COALESCE(shipping_cost, 0),
      updated_at = now()
  WHERE order_id = v_order_id
    AND (invoice_type = 'full' OR invoice_type IS NULL)
    AND quickbooks_sync_status IS DISTINCT FROM 'synced'
    AND deleted_at IS NULL;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Recreate the trigger
CREATE TRIGGER trigger_recalculate_order_totals
AFTER INSERT OR UPDATE OR DELETE ON order_items
FOR EACH ROW
EXECUTE FUNCTION recalculate_order_totals();