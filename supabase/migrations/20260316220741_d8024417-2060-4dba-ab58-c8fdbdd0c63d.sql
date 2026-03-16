ALTER TABLE public.financed_invoices ADD COLUMN IF NOT EXISTS finance_status text NOT NULL DEFAULT 'active';

COMMENT ON COLUMN public.financed_invoices.finance_status IS 'Pipeline stage: pending, active, completed';