-- Add shipped_quantity column to order_items
ALTER TABLE public.order_items 
ADD COLUMN shipped_quantity integer;

-- Set default shipped_quantity to match ordered quantity for existing records
UPDATE public.order_items 
SET shipped_quantity = quantity 
WHERE shipped_quantity IS NULL;

-- Make shipped_quantity non-nullable after setting defaults
ALTER TABLE public.order_items 
ALTER COLUMN shipped_quantity SET NOT NULL;

-- Add shipped_quantity column to vendor_po_items
ALTER TABLE public.vendor_po_items 
ADD COLUMN shipped_quantity integer;

-- Set default shipped_quantity to match ordered quantity for existing records
UPDATE public.vendor_po_items 
SET shipped_quantity = quantity 
WHERE shipped_quantity IS NULL;

-- Make shipped_quantity non-nullable after setting defaults
ALTER TABLE public.vendor_po_items 
ALTER COLUMN shipped_quantity SET NOT NULL;