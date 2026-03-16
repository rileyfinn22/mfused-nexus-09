
-- Add confirmation columns to finance_repayments
ALTER TABLE public.finance_repayments 
  ADD COLUMN confirmation_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN confirmed_at timestamptz,
  ADD COLUMN confirmed_by uuid,
  ADD COLUMN dispute_note text;

-- Add confirmation columns to finance_deposits
ALTER TABLE public.finance_deposits
  ADD COLUMN confirmation_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN confirmed_at timestamptz,
  ADD COLUMN confirmed_by uuid,
  ADD COLUMN dispute_note text;

-- RLS: Allow finance users to update confirmation fields on finance_repayments
CREATE POLICY "Finance users can update repayment confirmation"
ON public.finance_repayments
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'finance'::app_role))
WITH CHECK (has_role(auth.uid(), 'finance'::app_role));

-- RLS: Allow finance users to SELECT finance_repayments
CREATE POLICY "Finance users can view repayments"
ON public.finance_repayments
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'finance'::app_role));

-- RLS: Allow finance users to update confirmation fields on finance_deposits
CREATE POLICY "Finance users can update deposit confirmation"
ON public.finance_deposits
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'finance'::app_role))
WITH CHECK (has_role(auth.uid(), 'finance'::app_role));

-- RLS: Allow finance users to SELECT finance_deposits
CREATE POLICY "Finance users can view deposits"
ON public.finance_deposits
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'finance'::app_role));

-- RLS: Allow finance users to SELECT and INSERT on financed_invoice_documents
CREATE POLICY "Finance users can view documents"
ON public.financed_invoice_documents
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'finance'::app_role));

CREATE POLICY "Finance users can upload documents"
ON public.financed_invoice_documents
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'finance'::app_role));

-- Storage: Allow finance users to upload to po-documents bucket
CREATE POLICY "Finance users can upload to po-documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'po-documents' 
  AND has_role(auth.uid(), 'finance'::app_role)
);

CREATE POLICY "Finance users can read po-documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'po-documents' 
  AND has_role(auth.uid(), 'finance'::app_role)
);
