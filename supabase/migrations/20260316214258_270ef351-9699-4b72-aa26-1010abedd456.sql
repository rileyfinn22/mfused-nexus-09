-- Allow finance users to upload and view files in po-documents bucket
CREATE POLICY "Finance users can upload po-documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'po-documents' AND has_role(auth.uid(), 'finance'::app_role));

CREATE POLICY "Finance users can view po-documents"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'po-documents' AND has_role(auth.uid(), 'finance'::app_role));