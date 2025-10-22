-- Add parent_order_id to orders table to link pull & ship orders to production orders
ALTER TABLE public.orders 
ADD COLUMN parent_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL;

-- Add comment to explain the field
COMMENT ON COLUMN public.orders.parent_order_id IS 'For pull_ship orders, this references the parent production order';

-- Create index for better performance when querying child orders
CREATE INDEX idx_orders_parent_order_id ON public.orders(parent_order_id);

-- Update RLS policies to allow viewing child orders when you can view parent
CREATE POLICY "Users can view child orders of their company orders"
ON public.orders
FOR SELECT
USING (
  parent_order_id IN (
    SELECT id FROM public.orders 
    WHERE company_id = get_user_company(auth.uid())
  )
);