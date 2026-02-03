-- Drop the existing restrictive update policy
DROP POLICY IF EXISTS "Company admins can update artwork for their companies" ON public.artwork_files;

-- Create a new policy that allows users with company access to update artwork (for approvals)
-- This enables customers to approve their own company's vibe proofs
CREATE POLICY "Users can update artwork for their companies"
ON public.artwork_files
FOR UPDATE
USING (
  has_role(auth.uid(), 'vibe_admin'::app_role) OR 
  user_has_company_access(auth.uid(), company_id)
)
WITH CHECK (
  has_role(auth.uid(), 'vibe_admin'::app_role) OR 
  user_has_company_access(auth.uid(), company_id)
);