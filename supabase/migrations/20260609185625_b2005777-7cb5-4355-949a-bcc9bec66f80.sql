ALTER TABLE public.vendor_po_items
  DROP CONSTRAINT IF EXISTS vendor_po_items_order_item_id_fkey;

ALTER TABLE public.vendor_po_items
  ADD CONSTRAINT vendor_po_items_order_item_id_fkey
  FOREIGN KEY (order_item_id) REFERENCES public.order_items(id) ON DELETE SET NULL;