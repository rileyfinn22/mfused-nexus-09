-- Create storage bucket for quote documents if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('quote-documents', 'quote-documents', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Drop existing policies if they exist and recreate
DROP POLICY IF EXISTS "Users can upload quote documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can view quote documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their quote documents" ON storage.objects;

-- Allow authenticated users to upload to quote-documents bucket
CREATE POLICY "Users can upload quote documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'quote-documents');

-- Allow public read access to quote documents
CREATE POLICY "Anyone can view quote documents"
ON storage.objects FOR SELECT
USING (bucket_id = 'quote-documents');

-- Allow authenticated users to delete from quote-documents bucket
CREATE POLICY "Users can delete quote documents"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'quote-documents');