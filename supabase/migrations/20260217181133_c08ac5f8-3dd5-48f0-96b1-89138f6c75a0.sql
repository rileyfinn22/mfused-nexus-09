
-- Trigger function: when an invoice status changes to 'paid', check if ALL invoices
-- for that order are paid. If so, mark the order as 'completed'.
CREATE OR REPLACE FUNCTION public.auto_complete_order_on_full_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order_id uuid;
  v_all_paid boolean;
  v_order_status text;
BEGIN
  v_order_id := NEW.order_id;

  -- Only proceed if the invoice just became 'paid'
  IF NEW.status != 'paid' THEN
    RETURN NEW;
  END IF;

  -- Get current order status
  SELECT status INTO v_order_status
  FROM orders
  WHERE id = v_order_id;

  -- Don't touch orders already completed/cancelled
  IF v_order_status IN ('completed', 'cancelled') THEN
    RETURN NEW;
  END IF;

  -- Check if ALL non-deleted invoices for this order are paid
  SELECT NOT EXISTS (
    SELECT 1 FROM invoices
    WHERE order_id = v_order_id
      AND deleted_at IS NULL
      AND status != 'paid'
  ) INTO v_all_paid;

  -- Also ensure there is at least one invoice
  IF v_all_paid AND EXISTS (
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

-- Create trigger on invoices table
CREATE TRIGGER auto_complete_order_on_payment
AFTER UPDATE OF status ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.auto_complete_order_on_full_payment();
