-- Create payments table to track invoice payments
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  invoice_id UUID NOT NULL,
  payment_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  amount NUMERIC NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL DEFAULT 'check',
  reference_number TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for payments
CREATE POLICY "Users can view company payments"
  ON public.payments
  FOR SELECT
  USING (company_id = get_user_company(auth.uid()));

CREATE POLICY "Admins can create company payments"
  ON public.payments
  FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'admin') AND 
    company_id = get_user_company(auth.uid())
  );

CREATE POLICY "Admins can update company payments"
  ON public.payments
  FOR UPDATE
  USING (
    has_role(auth.uid(), 'admin') AND 
    company_id = get_user_company(auth.uid())
  );

CREATE POLICY "Admins can delete company payments"
  ON public.payments
  FOR DELETE
  USING (
    has_role(auth.uid(), 'admin') AND 
    company_id = get_user_company(auth.uid())
  );

-- Vibe admin policies
CREATE POLICY "Vibe admins can view all payments"
  ON public.payments
  FOR SELECT
  USING (has_role(auth.uid(), 'vibe_admin'));

CREATE POLICY "Vibe admins can create all payments"
  ON public.payments
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'vibe_admin'));

CREATE POLICY "Vibe admins can update all payments"
  ON public.payments
  FOR UPDATE
  USING (has_role(auth.uid(), 'vibe_admin'));

CREATE POLICY "Vibe admins can delete all payments"
  ON public.payments
  FOR DELETE
  USING (has_role(auth.uid(), 'vibe_admin'));

-- Trigger for updated_at
CREATE TRIGGER update_payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add total_paid column to invoices to cache payment totals
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS total_paid NUMERIC DEFAULT 0;

-- Function to update invoice status based on payments
CREATE OR REPLACE FUNCTION public.update_invoice_payment_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      WHEN payment_total > 0 THEN 'partial'
      ELSE 'open'
    END
  WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Trigger to update invoice status when payments change
CREATE TRIGGER update_invoice_on_payment_insert
  AFTER INSERT ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_invoice_payment_status();

CREATE TRIGGER update_invoice_on_payment_update
  AFTER UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_invoice_payment_status();

CREATE TRIGGER update_invoice_on_payment_delete
  AFTER DELETE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_invoice_payment_status();

COMMENT ON TABLE public.payments IS 'Tracks payments received against invoices';
COMMENT ON COLUMN public.payments.payment_method IS 'Payment method: check, wire, credit_card, cash, etc.';