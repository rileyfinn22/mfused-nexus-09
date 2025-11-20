-- Allow admins to delete their company order items so editing orders can safely replace items
CREATE POLICY "Admins can delete company order items" ON public.order_items
FOR DELETE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND EXISTS (
    SELECT 1
    FROM orders
    WHERE orders.id = order_items.order_id
      AND orders.company_id = get_user_company(auth.uid())
  )
);

-- Allow vibe admins to delete any order items
CREATE POLICY "Vibe admins can delete order items" ON public.order_items
FOR DELETE
USING (has_role(auth.uid(), 'vibe_admin'::app_role));
