
ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS tracking_carrier text,
  ADD COLUMN IF NOT EXISTS tracking_url text,
  ADD COLUMN IF NOT EXISTS shipping_method text;

ALTER TABLE public.vendor_pos
  ADD COLUMN IF NOT EXISTS shipping_method text;

-- Allow finance role to update orders and vendor POs
DROP POLICY IF EXISTS "Finance can update orders" ON public.orders;
CREATE POLICY "Finance can update orders" ON public.orders
  FOR UPDATE USING (has_role(auth.uid(), 'finance'::app_role));

DROP POLICY IF EXISTS "Finance can update vendor POs" ON public.vendor_pos;
CREATE POLICY "Finance can update vendor POs" ON public.vendor_pos
  FOR UPDATE USING (has_role(auth.uid(), 'finance'::app_role));

DROP POLICY IF EXISTS "Finance can update invoices" ON public.invoices;
CREATE POLICY "Finance can update invoices" ON public.invoices
  FOR UPDATE USING (has_role(auth.uid(), 'finance'::app_role));
