-- Add description column to vendor_po_items table
ALTER TABLE public.vendor_po_items 
ADD COLUMN IF NOT EXISTS description text;