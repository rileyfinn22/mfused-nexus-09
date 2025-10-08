-- Make order_item_id nullable in vendor_po_items to allow custom line items
ALTER TABLE public.vendor_po_items 
ALTER COLUMN order_item_id DROP NOT NULL;