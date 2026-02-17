
CREATE OR REPLACE FUNCTION public.auto_complete_order_on_full_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order_id uuid;
  v_all_child_billed boolean;
  v_all_shipped boolean;
  v_order_status text;
BEGIN
  v_order_id := NEW.order_id;

  SELECT status INTO v_order_status
  FROM orders WHERE id = v_order_id;

  IF v_order_status IN ('completed', 'cancelled') THEN
    RETURN NEW;
  END IF;

  -- Check all non-deleted CHILD invoices (shipment invoices) are billed/paid/final_review
  -- Blanket/parent invoices (invoice_type = 'full' or parent with children) are excluded
  SELECT NOT EXISTS (
    SELECT 1 FROM invoices
    WHERE order_id = v_order_id
      AND deleted_at IS NULL
      AND parent_invoice_id IS NOT NULL
      AND status NOT IN ('billed', 'paid', 'final_review')
  ) INTO v_all_child_billed;

  -- Check all order items are fully shipped
  SELECT NOT EXISTS (
    SELECT 1 FROM order_items
    WHERE order_id = v_order_id
      AND shipped_quantity < quantity
  ) INTO v_all_shipped;

  -- Must have at least one child invoice and all shipped
  IF v_all_child_billed AND v_all_shipped AND EXISTS (
    SELECT 1 FROM invoices 
    WHERE order_id = v_order_id 
      AND deleted_at IS NULL 
      AND parent_invoice_id IS NOT NULL
  ) THEN
    UPDATE orders
    SET status = 'completed', updated_at = now()
    WHERE id = v_order_id;
  END IF;

  RETURN NEW;
END;
$function$;

-- Also retroactively complete qualifying orders
UPDATE orders
SET status = 'completed', updated_at = now()
WHERE order_type != 'pull_ship'
  AND parent_order_id IS NULL
  AND status NOT IN ('completed', 'cancelled')
  AND NOT EXISTS (
    SELECT 1 FROM invoices
    WHERE invoices.order_id = orders.id
      AND deleted_at IS NULL
      AND parent_invoice_id IS NOT NULL
      AND status NOT IN ('billed', 'paid', 'final_review')
  )
  AND NOT EXISTS (
    SELECT 1 FROM order_items
    WHERE order_items.order_id = orders.id
      AND shipped_quantity < quantity
  )
  AND EXISTS (
    SELECT 1 FROM invoices
    WHERE invoices.order_id = orders.id
      AND deleted_at IS NULL
      AND parent_invoice_id IS NOT NULL
  );
