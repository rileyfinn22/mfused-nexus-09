-- Add thumbnail_url column to product_templates
ALTER TABLE public.product_templates 
ADD COLUMN thumbnail_url TEXT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.product_templates.thumbnail_url IS 'URL to the template thumbnail image stored in product-images bucket';