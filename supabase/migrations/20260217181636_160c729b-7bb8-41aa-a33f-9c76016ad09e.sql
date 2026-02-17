
-- Update the trigger to also complete orders when fully billed (not just paid)
CREATE OR REPLACE FUNCTION public.auto_complete_order_on_full_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order_id uuid;
  v_all_billed boolean;
  v_order_status text;
BEGIN
  v_order_id := NEW.order_id;

  -- Get current order status
  SELECT status INTO v_order_status
  FROM orders
  WHERE id = v_order_id;

  -- Don't touch orders already completed/cancelled
  IF v_order_status IN ('completed', 'cancelled') THEN
    RETURN NEW;
  END IF;

  -- Check if ALL non-deleted invoices are at least billed/paid/final_review
  -- (i.e., none are in draft/open/partial status)
  SELECT NOT EXISTS (
    SELECT 1 FROM invoices
    WHERE order_id = v_order_id
      AND deleted_at IS NULL
      AND status NOT IN ('billed', 'paid', 'final_review')
  ) INTO v_all_billed;

  -- Ensure there is at least one invoice
  IF v_all_billed AND EXISTS (
    SELECT 1 FROM invoices WHERE order_id = v_order_id AND deleted_at IS NULL
  ) THEN
    UPDATE orders
    SET status = 'completed',
        updated_at = now()
    WHERE id = v_order_id;
  END IF;

  RETURN NEW;
END;
$function$;

-- Drop old trigger and recreate to fire on any status change
DROP TRIGGER IF EXISTS auto_complete_order_on_payment ON public.invoices;
CREATE TRIGGER auto_complete_order_on_payment
AFTER UPDATE OF status ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.auto_complete_order_on_full_payment();
