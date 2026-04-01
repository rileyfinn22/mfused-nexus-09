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
  -- Get the invoice total
  SELECT total INTO invoice_total
  FROM invoices
  WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);
  
  -- Calculate total payments for this invoice
  SELECT COALESCE(SUM(amount), 0) INTO payment_total
  FROM payments
  WHERE invoice_id = COALESCE(NEW.invoice_id, OLD.invoice_id);
  
  -- Update invoice total_paid and status
  UPDATE invoices
  SET 
    total_paid = payment_total,
    status = CASE
      WHEN payment_total >= total THEN 'paid'
      ELSE 'open'
    END
  WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$function$;