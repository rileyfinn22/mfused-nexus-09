
-- Fix the vibe admin update policy for products table
-- Drop existing incomplete policy if it exists
DROP POLICY IF EXISTS "Vibe admins can update all products" ON public.products;

-- Recreate the complete policy
CREATE POLICY "Vibe admins can update all products"
ON public.products
FOR UPDATE
USING (has_role(auth.uid(), 'vibe_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'vibe_admin'::app_role));
