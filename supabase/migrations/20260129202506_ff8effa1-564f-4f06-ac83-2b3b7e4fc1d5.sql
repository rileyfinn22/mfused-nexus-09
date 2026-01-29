-- Update artwork_files RLS policies to support multi-company users
-- Drop old policies that use get_user_company (which only returns first company)
DROP POLICY IF EXISTS "Company admins can view company artwork" ON public.artwork_files;
DROP POLICY IF EXISTS "Company users can view their artwork" ON public.artwork_files;
DROP POLICY IF EXISTS "Company admins can create company artwork" ON public.artwork_files;
DROP POLICY IF EXISTS "Company admins can update company artwork" ON public.artwork_files;
DROP POLICY IF EXISTS "Company admins can delete company artwork" ON public.artwork_files;

-- Create new policies using user_has_company_access for multi-company support
-- SELECT: Users can view artwork for any company they have access to
CREATE POLICY "Users can view artwork for their companies"
ON public.artwork_files
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'vibe_admin'::app_role) 
  OR user_has_company_access(auth.uid(), company_id)
);

-- INSERT: Company admins can create artwork for companies they have access to
CREATE POLICY "Company admins can create artwork for their companies"
ON public.artwork_files
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'vibe_admin'::app_role)
  OR (has_role(auth.uid(), 'admin'::app_role) AND user_has_company_access(auth.uid(), company_id))
);

-- UPDATE: Company admins can update artwork for companies they have access to
CREATE POLICY "Company admins can update artwork for their companies"
ON public.artwork_files
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'vibe_admin'::app_role)
  OR (has_role(auth.uid(), 'admin'::app_role) AND user_has_company_access(auth.uid(), company_id))
);

-- DELETE: Company admins can delete artwork for companies they have access to
CREATE POLICY "Company admins can delete artwork for their companies"
ON public.artwork_files
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'vibe_admin'::app_role)
  OR (has_role(auth.uid(), 'admin'::app_role) AND user_has_company_access(auth.uid(), company_id))
);

-- Also drop old vibe_admin policies since they're now combined into the new policies
DROP POLICY IF EXISTS "Vibe admins can view all artwork" ON public.artwork_files;
DROP POLICY IF EXISTS "Vibe admins can create all artwork" ON public.artwork_files;
DROP POLICY IF EXISTS "Vibe admins can update all artwork" ON public.artwork_files;
DROP POLICY IF EXISTS "Vibe admins can delete all artwork" ON public.artwork_files;