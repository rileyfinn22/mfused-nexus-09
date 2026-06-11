ALTER TABLE public.products ADD COLUMN IF NOT EXISTS customer_item_id TEXT;
CREATE INDEX IF NOT EXISTS idx_products_customer_item_id ON public.products(customer_item_id);