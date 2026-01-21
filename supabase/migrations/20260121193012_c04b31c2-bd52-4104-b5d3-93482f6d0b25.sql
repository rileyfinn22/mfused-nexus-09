-- Add estimated_delivery_date column to orders table
ALTER TABLE public.orders 
ADD COLUMN estimated_delivery_date DATE;