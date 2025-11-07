-- Make inventory_id nullable to support direct ship allocations
ALTER TABLE public.inventory_allocations 
ALTER COLUMN inventory_id DROP NOT NULL;

-- Add a comment to explain direct ship allocations
COMMENT ON COLUMN public.inventory_allocations.inventory_id IS 'References inventory record. NULL for direct ship scenarios where inventory was not tracked.';