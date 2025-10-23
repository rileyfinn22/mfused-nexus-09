-- Add price and preferred vendor columns to products table
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS price numeric,
ADD COLUMN IF NOT EXISTS preferred_vendor_id uuid REFERENCES public.vendors(id);

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_products_preferred_vendor ON public.products(preferred_vendor_id);