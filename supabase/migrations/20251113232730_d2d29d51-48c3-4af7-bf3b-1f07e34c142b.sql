-- Add INSERT policy for vibe admins on inventory table
CREATE POLICY "Vibe admins can create all inventory"
ON public.inventory
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'vibe_admin'::app_role));

-- Add DELETE policy for vibe admins on inventory table
CREATE POLICY "Vibe admins can delete all inventory"
ON public.inventory
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'vibe_admin'::app_role));