-- Allow finance role to read financed_invoices
CREATE POLICY "Finance users can view financed_invoices"
ON public.financed_invoices
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'finance'::app_role));

-- Allow finance role to read finance_deposits
CREATE POLICY "Finance users can view finance_deposits"
ON public.finance_deposits
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'finance'::app_role));

-- Also check finance_share_links and financed_invoice_documents
CREATE POLICY "Finance users can view finance_share_links"
ON public.finance_share_links
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'finance'::app_role));

CREATE POLICY "Finance users can view financed_invoice_documents"
ON public.financed_invoice_documents
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'finance'::app_role));