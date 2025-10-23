-- Add RLS policy to allow vibe admins to delete products
CREATE POLICY "Vibe admins can delete all products" 
ON public.products 
FOR DELETE 
USING (has_role(auth.uid(), 'vibe_admin'::app_role));