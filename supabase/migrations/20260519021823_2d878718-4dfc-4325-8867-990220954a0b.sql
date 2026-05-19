CREATE OR REPLACE FUNCTION public.update_financed_invoice_repayment_total()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  total_repaid NUMERIC;
  financed_amt NUMERIC;
  last_payment_date TIMESTAMPTZ;
  target_id UUID;
BEGIN
  target_id := COALESCE(NEW.financed_invoice_id, OLD.financed_invoice_id);

  SELECT COALESCE(SUM(amount), 0), MAX(payment_date)::timestamptz
  INTO total_repaid, last_payment_date
  FROM public.finance_repayments
  WHERE financed_invoice_id = target_id;

  SELECT financed_amount INTO financed_amt
  FROM public.financed_invoices
  WHERE id = target_id;

  UPDATE public.financed_invoices
  SET paid_back_amount = total_repaid,
      paid_back_date = CASE WHEN total_repaid > 0 THEN last_payment_date ELSE NULL END,
      status = CASE WHEN total_repaid >= financed_amt THEN 'paid' ELSE 'open' END,
      finance_status = CASE 
        WHEN total_repaid >= financed_amt AND finance_status = 'active' THEN 'completed'
        ELSE finance_status
      END,
      updated_at = now()
  WHERE id = target_id;

  RETURN COALESCE(NEW, OLD);
END;
$function$;