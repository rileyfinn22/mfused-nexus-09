-- Add CASCADE delete to vendor_pos foreign key
ALTER TABLE public.vendor_pos
DROP CONSTRAINT IF EXISTS vendor_pos_order_id_fkey,
ADD CONSTRAINT vendor_pos_order_id_fkey 
  FOREIGN KEY (order_id) 
  REFERENCES public.orders(id) 
  ON DELETE CASCADE;

-- Add CASCADE delete to vendor_po_items foreign key
ALTER TABLE public.vendor_po_items
DROP CONSTRAINT IF EXISTS vendor_po_items_order_item_id_fkey,
ADD CONSTRAINT vendor_po_items_order_item_id_fkey 
  FOREIGN KEY (order_item_id) 
  REFERENCES public.order_items(id) 
  ON DELETE CASCADE;

-- Add CASCADE delete to order_items foreign key
ALTER TABLE public.order_items
DROP CONSTRAINT IF EXISTS order_items_order_id_fkey,
ADD CONSTRAINT order_items_order_id_fkey 
  FOREIGN KEY (order_id) 
  REFERENCES public.orders(id) 
  ON DELETE CASCADE;