-- NOTE: must run via Lovable's migration runner (storage.objects needs
-- table-owner privileges the claude-admin proxy doesn't have).
-- Supersedes 20260723120001 / 20260727150001 / 20260727160001.
--
-- Customers may open a po-documents file ONLY when it is attached to a
-- progress note that a vibe admin authored. Vendor-authored notes and all
-- vendor doc slots (packing lists, proofs, qty sheets, final invoices) are
-- never customer-readable.

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
      AND public.has_role(u.created_by, 'vibe_admin'::public.app_role)
      AND public.user_has_company_access(auth.uid(), o.company_id)
  )
);
