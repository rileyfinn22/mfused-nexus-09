-- Add order finalized approval fields to orders table
ALTER TABLE public.orders 
ADD COLUMN order_finalized boolean NOT NULL DEFAULT false,
ADD COLUMN order_finalized_by uuid REFERENCES auth.users(id),
ADD COLUMN order_finalized_at timestamp with time zone;