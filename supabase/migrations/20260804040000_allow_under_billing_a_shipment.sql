-- A child shipment invoice had to equal its allocations to the cent, in both directions.
--
-- Billing MORE than was allocated is a genuine error -- you would be charging for goods that
-- never shipped. Billing LESS is a decision somebody is allowed to make: a shortfall gets
-- absorbed rather than re-billed to the customer. The old check treated both as corruption, so
-- an invoice that had already under-billed could not be saved at all. 10724-02 is stuck like
-- that right now: 12,029.25 billed against 12,420 allocated, and the difference is being eaten
-- deliberately.
--
-- Over-billing is still refused.

CREATE OR REPLACE FUNCTION public.validate_child_invoice_subtotal()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_expected numeric;
  v_alloc_count integer;
BEGIN
  -- Only validate child shipment invoices that are active
  IF NEW.parent_invoice_id IS NULL OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(ia.quantity_allocated * oi.unit_price), 0), COUNT(*)
  INTO v_expected, v_alloc_count
  FROM public.inventory_allocations ia
  JOIN public.order_items oi ON oi.id = ia.order_item_id
  WHERE ia.invoice_id = NEW.id;

  -- Skip validation before allocations exist (INSERT happens before allocations are written)
  IF v_alloc_count = 0 THEN
    RETURN NEW;
  END IF;

  -- Charging for more than shipped is always wrong. Charging for less is a write-off.
  IF COALESCE(NEW.subtotal, 0) - v_expected > 0.01 THEN
    RAISE EXCEPTION 'Child invoice % bills % but only % was allocated to it. An invoice may bill less than it shipped (absorbing the difference) but never more.',
      NEW.invoice_number, NEW.subtotal, v_expected
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;
