-- Allow vibe_admins to create invoices for any company
CREATE POLICY "Vibe admins can create all invoices"
ON public.invoices
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'vibe_admin'::app_role));