-- Add ship to address fields to vendor_pos table
ALTER TABLE public.vendor_pos 
ADD COLUMN IF NOT EXISTS ship_to_name TEXT,
ADD COLUMN IF NOT EXISTS ship_to_street TEXT,
ADD COLUMN IF NOT EXISTS ship_to_city TEXT,
ADD COLUMN IF NOT EXISTS ship_to_state TEXT,
ADD COLUMN IF NOT EXISTS ship_to_zip TEXT;