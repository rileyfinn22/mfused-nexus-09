-- Add missing INSERT policy for vibe_admins on products table
CREATE POLICY "Vibe admins can create all products" 
ON public.products 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'vibe_admin'::app_role));