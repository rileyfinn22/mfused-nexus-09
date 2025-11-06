-- Drop existing artwork_files policies
DROP POLICY IF EXISTS "Admins can delete company artwork" ON public.artwork_files;
DROP POLICY IF EXISTS "Admins can update company artwork" ON public.artwork_files;
DROP POLICY IF EXISTS "Users can create company artwork" ON public.artwork_files;
DROP POLICY IF EXISTS "Users can view company artwork" ON public.artwork_files;
DROP POLICY IF EXISTS "Vibe admins can update all artwork" ON public.artwork_files;
DROP POLICY IF EXISTS "Vibe admins can view all artwork" ON public.artwork_files;

-- Vibe admins can see and manage all artwork files
CREATE POLICY "Vibe admins can view all artwork"
ON public.artwork_files
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'vibe_admin'::app_role));

CREATE POLICY "Vibe admins can create all artwork"
ON public.artwork_files
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'vibe_admin'::app_role));

CREATE POLICY "Vibe admins can update all artwork"
ON public.artwork_files
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'vibe_admin'::app_role));

CREATE POLICY "Vibe admins can delete all artwork"
ON public.artwork_files
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'vibe_admin'::app_role));

-- Company admins can manage their company's artwork
CREATE POLICY "Company admins can view company artwork"
ON public.artwork_files
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  AND company_id = get_user_company(auth.uid())
);

CREATE POLICY "Company admins can create company artwork"
ON public.artwork_files
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  AND company_id = get_user_company(auth.uid())
);

CREATE POLICY "Company admins can update company artwork"
ON public.artwork_files
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND company_id = get_user_company(auth.uid())
);

CREATE POLICY "Company admins can delete company artwork"
ON public.artwork_files
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND company_id = get_user_company(auth.uid())
);

-- Company users (non-admins) can only view their company's artwork
CREATE POLICY "Company users can view their artwork"
ON public.artwork_files
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'company'::app_role)
  AND company_id = get_user_company(auth.uid())
);