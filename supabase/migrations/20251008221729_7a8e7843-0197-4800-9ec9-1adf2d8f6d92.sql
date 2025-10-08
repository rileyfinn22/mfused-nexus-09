-- Add policy for vibe admins to create order items for any order
CREATE POLICY "Vibe admins can create all order items" 
ON public.order_items 
FOR INSERT 
TO authenticated
WITH CHECK (has_role(auth.uid(), 'vibe_admin'::app_role));