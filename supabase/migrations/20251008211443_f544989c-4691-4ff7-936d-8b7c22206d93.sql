-- First, delete any duplicate vendor_po_items (keeping only the most recent)
DELETE FROM public.vendor_po_items a
USING public.vendor_po_items b
WHERE a.vendor_po_id = b.vendor_po_id
  AND a.order_item_id = b.order_item_id
  AND a.order_item_id IS NOT NULL
  AND a.created_at < b.created_at;

-- Add a unique constraint to prevent future duplicates
-- This ensures each order_item can only appear once per vendor PO
ALTER TABLE public.vendor_po_items
ADD CONSTRAINT unique_vendor_po_order_item 
UNIQUE (vendor_po_id, order_item_id);

-- Create a partial unique index for custom items (where order_item_id is NULL)
-- This allows multiple custom items per vendor PO
CREATE UNIQUE INDEX unique_vendor_po_items_with_order_item 
ON public.vendor_po_items (vendor_po_id, order_item_id)
WHERE order_item_id IS NOT NULL;