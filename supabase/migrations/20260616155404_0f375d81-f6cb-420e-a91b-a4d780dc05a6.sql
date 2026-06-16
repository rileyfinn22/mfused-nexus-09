DROP POLICY IF EXISTS "Company admins can delete artwork for their companies" ON public.artwork_files;

CREATE POLICY "Users can delete artwork for their companies"
ON public.artwork_files
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'vibe_admin'::app_role)
  OR user_has_company_access(auth.uid(), company_id)
);