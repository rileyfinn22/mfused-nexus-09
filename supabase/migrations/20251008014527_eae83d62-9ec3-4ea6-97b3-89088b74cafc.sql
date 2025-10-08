-- Add item_id (SKU) column to products table
ALTER TABLE public.products
ADD COLUMN item_id TEXT UNIQUE;

-- Add index for faster lookups
CREATE INDEX idx_products_item_id ON public.products(item_id);

-- Add comment
COMMENT ON COLUMN public.products.item_id IS 'Custom product identifier/SKU for business use';