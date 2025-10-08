-- Add DELETE policy for invoices table
CREATE POLICY "Admins can delete company invoices" 
ON public.invoices 
FOR DELETE 
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  AND company_id = get_user_company(auth.uid())
);

CREATE POLICY "Vibe admins can delete all invoices" 
ON public.invoices 
FOR DELETE 
TO authenticated
USING (has_role(auth.uid(), 'vibe_admin'::app_role));