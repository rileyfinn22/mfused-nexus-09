-- Update payment status trigger to also clear stale billed_percentage once any payment lands
CREATE OR REPLACE FUNCTION public.update_invoice_payment_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  invoice_total NUMERIC;
  payment_total NUMERIC;
BEGIN
  SELECT total INTO invoice_total
  FROM invoices
  WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);

  SELECT COALESCE(SUM(amount), 0) INTO payment_total
  FROM payments
  WHERE invoice_id = COALESCE(NEW.invoice_id, OLD.invoice_id);

  UPDATE invoices
  SET
    total_paid = payment_total,
    -- Clear deposit % flag once any payment exists; it's only meaningful pre-payment.
    billed_percentage = CASE WHEN payment_total > 0 THEN NULL ELSE billed_percentage END,
    status = CASE
      WHEN payment_total >= total THEN 'paid'
      ELSE 'open'
    END
  WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Backfill: clear stale deposit % on all invoices that already have payments
UPDATE public.invoices
SET billed_percentage = NULL
WHERE billed_percentage IS NOT NULL
  AND total_paid > 0;