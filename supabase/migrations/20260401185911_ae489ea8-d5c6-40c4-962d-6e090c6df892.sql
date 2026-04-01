ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS billing_name text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS billing_street2 text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS shipping_street2 text;