-- Fix INSERT policy: allow vibe_admin to insert for any company
DROP POLICY IF EXISTS "Users can create company rejected artwork" ON public.rejected_artwork_files;

CREATE POLICY "Users can create company rejected artwork"
ON public.rejected_artwork_files FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'vibe_admin'::app_role)
  OR company_id = get_user_company(auth.uid())
);

-- Fix SELECT policy: allow vibe_admin to view all
DROP POLICY IF EXISTS "Users can view company rejected artwork" ON public.rejected_artwork_files;

CREATE POLICY "Users can view company rejected artwork"
ON public.rejected_artwork_files FOR SELECT
USING (
  has_role(auth.uid(), 'vibe_admin'::app_role)
  OR company_id = get_user_company(auth.uid())
);

-- Fix DELETE policy: use vibe_admin instead of deprecated admin role
DROP POLICY IF EXISTS "Admins can delete company rejected artwork" ON public.rejected_artwork_files;

CREATE POLICY "Admins can delete company rejected artwork"
ON public.rejected_artwork_files FOR DELETE
USING (
  has_role(auth.uid(), 'vibe_admin'::app_role)
);