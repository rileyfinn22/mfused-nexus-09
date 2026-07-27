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
      AND u.kind = 'update'
      AND u.published_at IS NOT NULL
      AND public.user_has_company_access(auth.uid(), o.company_id)
  )
);