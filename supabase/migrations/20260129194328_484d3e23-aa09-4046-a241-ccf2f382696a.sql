-- Allow multi-company users to view all companies they have access to (needed for the company switcher)

-- NOTE: Existing policies remain; Postgres policies are OR'ed, so this expands access safely.

CREATE POLICY "Company members can view accessible companies"
ON public.companies
FOR SELECT
TO authenticated
USING (
  user_has_company_access(auth.uid(), id)
  OR has_role(auth.uid(), 'vibe_admin')
);
