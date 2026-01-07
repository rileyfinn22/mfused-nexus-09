-- Add order_id to inventory to link inventory to blanket orders
ALTER TABLE public.inventory 
ADD COLUMN order_id uuid REFERENCES public.orders(id);

-- Create index for performance
CREATE INDEX idx_inventory_order_id ON public.inventory(order_id);