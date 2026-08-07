-- ⚠ MUST BE APPLIED BY LOVABLE'S MIGRATION RUNNER, NOT THE claude-admin SQL PROXY.
-- Creating a policy on storage.objects fails there with "must be owner of table objects".
--
-- A customer opening /my-pos and clicking view or download on their own purchase order got
-- {"statusCode":"404","error":"Bucket not found","code":"NoSuchBucket"}. Two separate faults:
--
--   1. The page asked for a bucket called 'customer-pos', which has never existed. Fixed in
--      src/pages/MyPOs.tsx -- the files are in po-documents, keyed off orders.po_pdf_path.
--
--   2. Even with the right bucket, no policy covered them. The only customer-facing rule on
--      po-documents is "Users can view their own PO documents", which requires the first path
--      folder to equal the VIEWER's user id -- and all 7 of these PDFs sit under the folder of
--      the admin who uploaded them. So the customer who sent us the PO could not read it back.
--
-- This grants exactly one thing: the object an order's po_pdf_path points at, to members of
-- that order's company. It is the customer's OWN purchase order, the document they sent us.
-- Nothing about vendors, vendor POs or costs is reachable through it.

DROP POLICY IF EXISTS "Company users view their order PO documents" ON storage.objects;
CREATE POLICY "Company users view their order PO documents"
ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'po-documents'
  AND EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.po_pdf_path = name
      AND public.user_has_company_access(auth.uid(), o.company_id)
  )
);
