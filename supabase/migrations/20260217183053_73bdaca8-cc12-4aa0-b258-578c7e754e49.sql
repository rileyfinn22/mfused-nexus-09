
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
  v_production_progress integer;
BEGIN
  v_order_id := NEW.order_id;

  SELECT status, production_progress INTO v_order_status, v_production_progress
  FROM orders WHERE id = v_order_id;

  IF v_order_status IN ('completed', 'cancelled') THEN
    RETURN NEW;
  END IF;

  -- Check all non-deleted CHILD invoices are billed/paid/final_review
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

  -- Complete if: (all child invoices billed AND all shipped) OR production_progress = 100
  IF (
    (v_all_child_billed AND v_all_shipped AND EXISTS (
      SELECT 1 FROM invoices 
      WHERE order_id = v_order_id 
        AND deleted_at IS NULL 
        AND parent_invoice_id IS NOT NULL
    ))
    OR v_production_progress >= 100
  ) THEN
    UPDATE orders
    SET status = 'completed', updated_at = now()
    WHERE id = v_order_id;
  END IF;

  RETURN NEW;
END;
$function$;

-- Also add a trigger on orders table for when production_progress is updated
CREATE OR REPLACE FUNCTION public.auto_complete_order_on_progress()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status NOT IN ('completed', 'cancelled') AND NEW.production_progress >= 100 THEN
    NEW.status := 'completed';
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trigger_auto_complete_on_progress ON public.orders;
CREATE TRIGGER trigger_auto_complete_on_progress
  BEFORE UPDATE OF production_progress ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_complete_order_on_progress();

-- Retroactively complete orders with production_progress >= 100
UPDATE orders
SET status = 'completed', updated_at = now()
WHERE status NOT IN ('completed', 'cancelled')
  AND order_type != 'pull_ship'
  AND parent_order_id IS NULL
  AND production_progress >= 100;
