-- Create storage bucket for packing lists
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('packing-lists', 'packing-lists', false, 10485760)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload packing lists (vibe_admin only)
CREATE POLICY "Vibe admins can upload packing lists"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'packing-lists' 
  AND has_role(auth.uid(), 'vibe_admin')
);

-- Allow authenticated users to view packing lists they have access to
CREATE POLICY "Users can view packing lists for their invoices"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'packing-lists' 
  AND (
    has_role(auth.uid(), 'vibe_admin')
    OR EXISTS (
      SELECT 1 FROM invoice_packing_lists ipl
      JOIN invoices i ON i.id = ipl.invoice_id
      JOIN user_roles ur ON ur.company_id = i.company_id
      WHERE ipl.file_path = name AND ur.user_id = auth.uid()
    )
  )
);

-- Allow vibe admins to delete packing lists
CREATE POLICY "Vibe admins can delete packing lists"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'packing-lists' 
  AND has_role(auth.uid(), 'vibe_admin')
);