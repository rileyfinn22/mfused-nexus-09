-- Add CASCADE delete to invoices foreign key
ALTER TABLE public.invoices
DROP CONSTRAINT IF EXISTS invoices_order_id_fkey,
ADD CONSTRAINT invoices_order_id_fkey 
  FOREIGN KEY (order_id) 
  REFERENCES public.orders(id) 
  ON DELETE CASCADE;

-- Add CASCADE delete to order_notes foreign key
ALTER TABLE public.order_notes
DROP CONSTRAINT IF EXISTS order_notes_order_id_fkey,
ADD CONSTRAINT order_notes_order_id_fkey 
  FOREIGN KEY (order_id) 
  REFERENCES public.orders(id) 
  ON DELETE CASCADE;

-- Add CASCADE delete to order_production_updates foreign key
ALTER TABLE public.order_production_updates
DROP CONSTRAINT IF EXISTS order_production_updates_order_id_fkey,
ADD CONSTRAINT order_production_updates_order_id_fkey 
  FOREIGN KEY (order_id) 
  REFERENCES public.orders(id) 
  ON DELETE CASCADE;