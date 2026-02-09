
-- Create project_documents table
CREATE TABLE public.project_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  description TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.project_documents ENABLE ROW LEVEL SECURITY;

-- SELECT: company access, vendors on stages, or vibe admins
CREATE POLICY "Users can view project documents"
ON public.project_documents FOR SELECT
USING (
  has_role(auth.uid(), 'vibe_admin')
  OR EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = order_id
    AND user_has_company_access(auth.uid(), o.company_id)
  )
  OR EXISTS (
    SELECT 1 FROM production_stages ps
    JOIN vendors v ON ps.vendor_id = v.id
    WHERE ps.order_id = project_documents.order_id
    AND v.user_id = auth.uid()
  )
);

-- INSERT: vibe admins or company access
CREATE POLICY "Users can insert project documents"
ON public.project_documents FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'vibe_admin')
  OR EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = order_id
    AND user_has_company_access(auth.uid(), o.company_id)
  )
);

-- DELETE: vibe admins only
CREATE POLICY "Vibe admins can delete project documents"
ON public.project_documents FOR DELETE
USING (has_role(auth.uid(), 'vibe_admin'));

-- Create storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('project-documents', 'project-documents', true);

-- Storage SELECT: public
CREATE POLICY "Project documents are publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'project-documents');

-- Storage INSERT: authenticated with company access or vibe admin
CREATE POLICY "Authenticated users can upload project documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'project-documents'
  AND auth.role() = 'authenticated'
);

-- Storage DELETE: vibe admins
CREATE POLICY "Vibe admins can delete project document files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'project-documents'
  AND has_role(auth.uid(), 'vibe_admin')
);
