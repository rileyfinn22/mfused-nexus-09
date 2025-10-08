-- Add policy for vibe admins to create orders for any company
CREATE POLICY "Vibe admins can create all orders" 
ON public.orders 
FOR INSERT 
TO authenticated
WITH CHECK (has_role(auth.uid(), 'vibe_admin'::app_role));