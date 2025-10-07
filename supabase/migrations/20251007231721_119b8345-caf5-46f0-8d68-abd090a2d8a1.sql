-- Add new columns to products table
ALTER TABLE public.products
ADD COLUMN description text,
ADD COLUMN state text,
ADD COLUMN cost numeric(10, 2);

-- Add a comment to clarify the name column represents the item
COMMENT ON COLUMN public.products.name IS 'Product item name';