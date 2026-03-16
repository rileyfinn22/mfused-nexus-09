-- Allow finance role to read vendor_pos (needed for financing page joins)
CREATE POLICY "Finance users can view vendor POs"
ON public.vendor_pos
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'finance'::app_role));