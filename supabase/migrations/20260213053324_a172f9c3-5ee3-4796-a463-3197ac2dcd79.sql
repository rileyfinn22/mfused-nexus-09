-- Add a free-form production progress percentage column to orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS production_progress integer DEFAULT 0;