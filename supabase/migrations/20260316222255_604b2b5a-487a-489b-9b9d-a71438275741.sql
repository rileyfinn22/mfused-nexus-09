
-- Individual repayment records for the financing ledger
CREATE TABLE public.finance_repayments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  financed_invoice_id UUID NOT NULL REFERENCES public.financed_invoices(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL DEFAULT 0,
  payment_date TEXT NOT NULL DEFAULT (now()::date)::text,
  payment_method TEXT DEFAULT 'wire',
  reference_number TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.finance_repayments ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users with vibe_admin or finance role to manage
CREATE POLICY "vibe_admins_manage_repayments" ON public.finance_repayments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'vibe_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'vibe_admin'));

CREATE POLICY "finance_view_repayments" ON public.finance_repayments
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'finance'));

-- Trigger to auto-update financed_invoices.paid_back_amount when repayments change
CREATE OR REPLACE FUNCTION public.update_financed_invoice_repayment_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  total_repaid NUMERIC;
  financed_amt NUMERIC;
  fee_amt NUMERIC;
  target_id UUID;
BEGIN
  target_id := COALESCE(NEW.financed_invoice_id, OLD.financed_invoice_id);

  SELECT COALESCE(SUM(amount), 0) INTO total_repaid
  FROM public.finance_repayments
  WHERE financed_invoice_id = target_id;

  -- Get financed amount for auto-complete check
  SELECT financed_amount INTO financed_amt
  FROM public.financed_invoices
  WHERE id = target_id;

  UPDATE public.financed_invoices
  SET paid_back_amount = total_repaid,
      paid_back_date = CASE WHEN total_repaid > 0 THEN now()::date::text ELSE NULL END,
      status = CASE WHEN total_repaid >= financed_amt THEN 'paid' ELSE 'open' END,
      finance_status = CASE 
        WHEN total_repaid >= financed_amt AND finance_status = 'active' THEN 'completed'
        ELSE finance_status
      END,
      updated_at = now()
  WHERE id = target_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_update_repayment_total
AFTER INSERT OR UPDATE OR DELETE ON public.finance_repayments
FOR EACH ROW EXECUTE FUNCTION public.update_financed_invoice_repayment_total();
