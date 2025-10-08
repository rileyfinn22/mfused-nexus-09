-- Add missing DELETE policy for vibe_admin on orders
DROP POLICY IF EXISTS "Vibe admins can delete all orders" ON public.orders;
CREATE POLICY "Vibe admins can delete all orders"
ON public.orders
FOR DELETE
USING (has_role(auth.uid(), 'vibe_admin'::app_role));