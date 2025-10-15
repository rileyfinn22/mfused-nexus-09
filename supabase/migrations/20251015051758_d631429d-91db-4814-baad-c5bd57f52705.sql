-- Step 1: Add new columns to invoices table for shipment tracking
ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS shipment_number integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS invoice_type text DEFAULT 'full' CHECK (invoice_type IN ('partial', 'final', 'full')),
ADD COLUMN IF NOT EXISTS billed_percentage numeric DEFAULT 100,
ADD COLUMN IF NOT EXISTS shipping_cost numeric DEFAULT 0;

-- Step 2: Migrate existing shipping_cost data from orders to invoices
UPDATE public.invoices i
SET shipping_cost = o.shipping_cost
FROM public.orders o
WHERE i.order_id = o.id
AND o.shipping_cost IS NOT NULL;

-- Step 3: Create inventory_allocations table
CREATE TABLE IF NOT EXISTS public.inventory_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  inventory_id uuid NOT NULL REFERENCES public.inventory(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  quantity_allocated integer NOT NULL CHECK (quantity_allocated > 0),
  allocated_at timestamp with time zone NOT NULL DEFAULT now(),
  allocated_by uuid REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'allocated' CHECK (status IN ('allocated', 'picked', 'shipped', 'cancelled')),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Step 4: Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_inventory_allocations_order_item ON public.inventory_allocations(order_item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_allocations_inventory ON public.inventory_allocations(inventory_id);
CREATE INDEX IF NOT EXISTS idx_inventory_allocations_invoice ON public.inventory_allocations(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoices_order_shipment ON public.invoices(order_id, shipment_number);

-- Step 5: Enable RLS on inventory_allocations
ALTER TABLE public.inventory_allocations ENABLE ROW LEVEL SECURITY;

-- Step 6: Create RLS policies for inventory_allocations
CREATE POLICY "Users can view company inventory allocations"
ON public.inventory_allocations
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.order_items oi
    JOIN public.orders o ON oi.order_id = o.id
    WHERE oi.id = inventory_allocations.order_item_id
    AND o.company_id = get_user_company(auth.uid())
  )
);

CREATE POLICY "Admins can create company inventory allocations"
ON public.inventory_allocations
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.order_items oi
    JOIN public.orders o ON oi.order_id = o.id
    WHERE oi.id = inventory_allocations.order_item_id
    AND o.company_id = get_user_company(auth.uid())
  )
);

CREATE POLICY "Vibe admins can create all inventory allocations"
ON public.inventory_allocations
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'vibe_admin'::app_role));

CREATE POLICY "Vibe admins can view all inventory allocations"
ON public.inventory_allocations
FOR SELECT
USING (has_role(auth.uid(), 'vibe_admin'::app_role));

CREATE POLICY "Admins can update company inventory allocations"
ON public.inventory_allocations
FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.order_items oi
    JOIN public.orders o ON oi.order_id = o.id
    WHERE oi.id = inventory_allocations.order_item_id
    AND o.company_id = get_user_company(auth.uid())
  )
);

CREATE POLICY "Vibe admins can update all inventory allocations"
ON public.inventory_allocations
FOR UPDATE
USING (has_role(auth.uid(), 'vibe_admin'::app_role));