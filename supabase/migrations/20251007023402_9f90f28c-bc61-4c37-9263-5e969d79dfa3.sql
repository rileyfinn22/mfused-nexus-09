-- Create storage bucket for PO PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('po-documents', 'po-documents', false);

-- Create po_submissions table
CREATE TABLE public.po_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  pdf_url TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_analysis' CHECK (status IN ('pending_analysis', 'analysis_complete', 'pending_approval', 'approved', 'rejected')),
  extracted_data JSONB,
  approved_pricing DECIMAL(10, 2),
  approved_lead_time_days INTEGER,
  approved_cost DECIMAL(10, 2),
  internal_notes TEXT,
  rejection_reason TEXT,
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.po_submissions ENABLE ROW LEVEL SECURITY;

-- Customers can view their own submissions
CREATE POLICY "Customers can view own submissions"
ON public.po_submissions
FOR SELECT
TO authenticated
USING (auth.uid() = customer_id);

-- Customers can insert their own submissions
CREATE POLICY "Customers can create submissions"
ON public.po_submissions
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = customer_id);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_po_submissions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_po_submissions_updated_at
BEFORE UPDATE ON public.po_submissions
FOR EACH ROW
EXECUTE FUNCTION public.update_po_submissions_updated_at();

-- Storage policies for PO documents
CREATE POLICY "Users can upload their own PO documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'po-documents' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can view their own PO documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'po-documents' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Create user_roles table for admin access
CREATE TYPE public.app_role AS ENUM ('admin', 'customer');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Admins can view all submissions
CREATE POLICY "Admins can view all submissions"
ON public.po_submissions
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Admins can update submissions (for approval)
CREATE POLICY "Admins can update submissions"
ON public.po_submissions
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Admins can view all PO documents
CREATE POLICY "Admins can view all PO documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'po-documents' AND
  public.has_role(auth.uid(), 'admin')
);