-- Add template_id to products table to link products to templates
ALTER TABLE public.products 
ADD COLUMN template_id UUID REFERENCES public.product_templates(id) ON DELETE SET NULL;