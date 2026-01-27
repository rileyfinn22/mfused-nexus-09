-- Create invoice_packing_lists table to store packing list files
CREATE TABLE public.invoice_packing_lists (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  file_type TEXT DEFAULT 'application/pdf',
  source TEXT DEFAULT 'uploaded', -- 'uploaded' or 'generated'
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID,
  notes TEXT
);

-- Enable Row Level Security
ALTER TABLE public.invoice_packing_lists ENABLE ROW LEVEL SECURITY;

-- Create policies
-- Vibe admins can do everything
CREATE POLICY "Vibe admins can manage all packing lists"
ON public.invoice_packing_lists
FOR ALL
USING (has_role(auth.uid(), 'vibe_admin'))
WITH CHECK (has_role(auth.uid(), 'vibe_admin'));

-- Company users can view packing lists for their invoices
CREATE POLICY "Users can view packing lists for their invoices"
ON public.invoice_packing_lists
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM invoices i
    JOIN user_roles ur ON ur.company_id = i.company_id
    WHERE i.id = invoice_packing_lists.invoice_id AND ur.user_id = auth.uid()
  )
);

-- Create index for faster lookups
CREATE INDEX idx_invoice_packing_lists_invoice_id ON public.invoice_packing_lists(invoice_id);