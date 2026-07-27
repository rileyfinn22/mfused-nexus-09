-- NOTE: must run via Lovable's migration runner (storage.objects needs
-- table-owner privileges the claude-admin proxy doesn't have).
--
-- Customers never see vendor notes or attachments, so they need NO access to
-- the po-documents bucket at all. Drops the customer-facing policy created by
-- 20260723120001 (and re-scoped by 20260727150001, which is now moot).

DROP POLICY IF EXISTS "Company users view production update documents" ON storage.objects;
