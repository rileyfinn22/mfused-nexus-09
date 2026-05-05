ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS tracking_carrier TEXT,
  ADD COLUMN IF NOT EXISTS tracking_number TEXT,
  ADD COLUMN IF NOT EXISTS tracking_url TEXT,
  ADD COLUMN IF NOT EXISTS shipping_method TEXT;