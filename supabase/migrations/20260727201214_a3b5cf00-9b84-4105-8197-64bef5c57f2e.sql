DROP POLICY IF EXISTS "Company users view production update documents" ON storage.objects;
CREATE POLICY "Company users view production update documents"
ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'po-documents'
  AND EXISTS (
    SELECT 1
    FROM public.vendor_po_production_updates u
    JOIN public.vendor_pos p ON p.id = u.vendor_po_id
    JOIN public.orders o ON o.id = p.order_id
    WHERE u.attachment_url = name
      AND u.kind IN ('update', 'packing_list', 'proof')
      AND public.user_has_company_access(auth.uid(), o.company_id)
  )
);

DROP POLICY IF EXISTS "Users delete their own PO documents" ON storage.objects;
CREATE POLICY "Users delete their own PO documents"
ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'po-documents'
  AND (storage.foldername(name))[1] = (auth.uid())::text
  AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid())
);