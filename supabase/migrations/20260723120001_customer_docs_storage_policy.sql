-- NOTE: this storage policy CANNOT be applied through the claude-admin SQL
-- proxy ("must be owner of table objects") — it must run via Lovable's own
-- migration runner. Until it applies, customers see attachment names on the
-- production detail page but the download links won't resolve.
--
-- Lets company users view po-documents files that vendors attached as
-- production updates / packing lists / proofs on POs linked to their orders.
-- Final invoices and shipped qty sheets are deliberately NOT covered.

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
