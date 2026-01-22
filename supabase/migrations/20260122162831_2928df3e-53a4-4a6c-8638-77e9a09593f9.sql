-- Add attachment column to vendor_pos
ALTER TABLE public.vendor_pos 
ADD COLUMN IF NOT EXISTS attachment_url TEXT,
ADD COLUMN IF NOT EXISTS attachment_name TEXT;

-- Create RLS policy for po-documents bucket if not exists
CREATE POLICY "Admins can upload PO documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'po-documents' 
  AND EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'vibe_admin')
  )
);

CREATE POLICY "Admins can view PO documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'po-documents'
  AND EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'vibe_admin', 'vendor')
  )
);

CREATE POLICY "Admins can delete PO documents"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'po-documents'
  AND EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'vibe_admin')
  )
);