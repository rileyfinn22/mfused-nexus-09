-- NOTE: must run via Lovable's migration runner (storage.objects policies
-- need table-owner privileges the claude-admin proxy doesn't have).
--
-- Tightens "Company users view production update documents": ALL vendor-
-- uploaded shipment documents (packing lists, proofs, shipped qty sheets,
-- final invoices) are vibe-admin-only; customers may open only progress-update
-- attachments. (Customer-facing packing lists live in invoice_packing_lists /
-- the packing-lists bucket instead.)

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
      AND public.user_has_company_access(auth.uid(), o.company_id)
  )
);
