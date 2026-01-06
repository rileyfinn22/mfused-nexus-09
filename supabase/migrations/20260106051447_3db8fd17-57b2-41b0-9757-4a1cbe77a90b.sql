-- Add state column to product_templates table for state-based product grouping
ALTER TABLE public.product_templates 
ADD COLUMN IF NOT EXISTS state text;