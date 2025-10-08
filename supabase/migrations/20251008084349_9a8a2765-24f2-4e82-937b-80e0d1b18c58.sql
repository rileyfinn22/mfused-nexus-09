-- Add order_type column to distinguish between standard and pull_ship orders
ALTER TABLE public.orders
ADD COLUMN order_type TEXT NOT NULL DEFAULT 'standard';

-- Add check constraint for valid order types
ALTER TABLE public.orders
ADD CONSTRAINT orders_order_type_check 
CHECK (order_type IN ('standard', 'pull_ship'));

-- Create index for filtering by order type
CREATE INDEX idx_orders_order_type ON public.orders(order_type);

COMMENT ON COLUMN public.orders.order_type IS 'Type of order: standard (normal order flow) or pull_ship (warehouse pull and ship flow)';