-- NOTE: must run via Lovable's migration runner (storage.objects needs
-- table-owner privileges the claude-admin proxy doesn't have).
-- Supersedes 20260723120001 / 150001 / 160001 / 170001.
--
-- Customers may open a po-documents file ONLY when it is attached to a
-- production note a vibe admin has PUBLISHED. Unpublished notes, vendor doc
-- slots (packing lists, proofs, qty sheets, final invoices) are never
-- customer-readable.

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
