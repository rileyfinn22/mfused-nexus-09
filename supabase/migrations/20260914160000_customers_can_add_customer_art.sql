-- Customers could not add their own artwork. The only INSERT policy on artwork_files was
--
--   has_role(vibe_admin) OR (has_role(admin) AND user_has_company_access(company_id))
--
-- and customer accounts carry the plain 'company' role, not 'admin'. The Add Customer Art
-- dialog uploaded the file to the artwork bucket (the bucket policy allows it), then the row
-- insert was rejected by RLS, so the file sat in storage with nothing pointing at it and the
-- product showed no art. Every artwork_files row created in the last week is Jack's.
--
-- A customer may now create artwork rows for a company they belong to, but only of type
-- 'customer'. Vibe proofs stay ours to create. The existing select/update/delete policies
-- already grant company members access to their own rows and are unchanged.

DROP POLICY IF EXISTS "Customers can add their own artwork" ON public.artwork_files;

CREATE POLICY "Customers can add their own artwork"
  ON public.artwork_files
  FOR INSERT
  TO authenticated
  WITH CHECK (
    artwork_type = 'customer'
    AND public.user_has_company_access(auth.uid(), company_id)
  );
