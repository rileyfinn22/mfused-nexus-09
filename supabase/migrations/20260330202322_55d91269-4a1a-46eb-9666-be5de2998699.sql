CREATE OR REPLACE FUNCTION public.recalculate_order_totals()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order_id uuid;
  v_new_subtotal numeric;
  v_new_total numeric;
  v_shipped_subtotal numeric;
  v_blanket_subtotal numeric;
  v_any_shipped boolean;
BEGIN
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
  
  -- Check if any items have shipped
  SELECT EXISTS(
    SELECT 1 FROM order_items
    WHERE order_id = v_order_id AND shipped_quantity > 0
  ) INTO v_any_shipped;
  
  -- Calculate shipped subtotal (only items that have actually shipped)
  SELECT COALESCE(SUM(shipped_quantity * unit_price), 0)
  INTO v_shipped_subtotal
  FROM order_items
  WHERE order_id = v_order_id AND shipped_quantity > 0;
  
  -- Blanket subtotal logic:
  -- Before any shipping: use ordered subtotal (placeholder)
  -- Once any item ships: use shipped-only subtotal
  IF v_any_shipped THEN
    v_blanket_subtotal := v_shipped_subtotal;
  ELSE
    v_blanket_subtotal := v_new_subtotal;
  END IF;
  
  -- Update the order with ORDERED amounts
  UPDATE orders
  SET subtotal = v_new_subtotal,
      total = v_new_subtotal + COALESCE(tax, 0) + COALESCE(shipping_cost, 0),
      updated_at = now()
  WHERE id = v_order_id;
  
  -- Update full/blanket invoices
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
$function$;