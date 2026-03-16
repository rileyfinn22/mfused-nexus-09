
-- Add fields for manual invoice number, tracking, and shipment info
ALTER TABLE public.financed_invoices
  ADD COLUMN IF NOT EXISTS invoice_number text,
  ADD COLUMN IF NOT EXISTS carrier text,
  ADD COLUMN IF NOT EXISTS tracking_number text,
  ADD COLUMN IF NOT EXISTS tracking_url text,
  ADD COLUMN IF NOT EXISTS shipment_notes text;

-- Create documents table for financed invoices
CREATE TABLE public.financed_invoice_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  financed_invoice_id uuid REFERENCES public.financed_invoices(id) ON DELETE CASCADE NOT NULL,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_size integer,
  file_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

ALTER TABLE public.financed_invoice_documents ENABLE ROW LEVEL SECURITY;

-- Only vibe_admins can manage financed invoice documents
CREATE POLICY "Vibe admins can manage financed invoice documents"
  ON public.financed_invoice_documents
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'vibe_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'vibe_admin'));
