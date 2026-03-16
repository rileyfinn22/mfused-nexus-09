-- Add description and created_by_role columns to financed_invoices
ALTER TABLE public.financed_invoices 
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS created_by_role text;

-- Allow finance users to INSERT financed_invoices
CREATE POLICY "Finance users can insert financed_invoices"
ON public.financed_invoices
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'finance'::app_role));

-- Allow finance users to UPDATE financed_invoices (for description edits)
CREATE POLICY "Finance users can update financed_invoices"
ON public.financed_invoices
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'finance'::app_role));

-- Allow finance users to upload documents
CREATE POLICY "Finance users can insert financed_invoice_documents"
ON public.financed_invoice_documents
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'finance'::app_role));