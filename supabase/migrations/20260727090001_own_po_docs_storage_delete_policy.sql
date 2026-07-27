-- NOTE: like 20260723120001, this storage policy CANNOT be applied through the
-- claude-admin SQL proxy ("must be owner of table objects") — it must run via
-- Lovable's own migration runner. Until it applies, a vendor deleting an
-- attachment removes the row (so the file disappears from every page) but the
-- storage object itself is orphaned in the bucket.
--
-- Lets users delete files inside their own uid folder of po-documents —
-- mirrors "Users can upload their own PO documents".

DROP POLICY IF EXISTS "Users delete their own PO documents" ON storage.objects;
CREATE POLICY "Users delete their own PO documents"
ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'po-documents'
  AND (storage.foldername(name))[1] = (auth.uid())::text
  AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid())
);
