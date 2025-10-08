-- Add policy for vibe_admin to update order items
CREATE POLICY "Vibe admins can update order items"
  ON public.order_items FOR UPDATE
  USING (has_role(auth.uid(), 'vibe_admin'::app_role));

-- Add policy for admins to update their company's order items
CREATE POLICY "Admins can update company order items"
  ON public.order_items FOR UPDATE
  USING (
    has_role(auth.uid(), 'admin'::app_role) 
    AND EXISTS (
      SELECT 1 FROM orders 
      WHERE orders.id = order_items.order_id 
      AND orders.company_id = get_user_company(auth.uid())
    )
  );