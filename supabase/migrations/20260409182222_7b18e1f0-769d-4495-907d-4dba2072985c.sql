
-- ============================================================
-- 1. CRITICAL: Remove privilege escalation on user_roles
-- Drop the "Users can insert own roles" policy that allows
-- any authenticated user to assign themselves ANY role
-- ============================================================
DROP POLICY IF EXISTS "Users can insert own roles" ON public.user_roles;

-- ============================================================
-- 2. Fix project-documents bucket: make private, restrict reads
-- ============================================================
UPDATE storage.buckets SET public = false WHERE id = 'project-documents';

-- Drop the overly permissive public read policy
DROP POLICY IF EXISTS "Project documents are publicly readable" ON storage.objects;

-- Create a proper read policy scoped to company access
CREATE POLICY "Users can view project documents for their company"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'project-documents'
  AND auth.uid() IS NOT NULL
  AND (
    has_role(auth.uid(), 'vibe_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.project_documents pd
      JOIN public.orders o ON o.id = pd.order_id
      WHERE pd.file_path = name
        AND user_has_company_access(auth.uid(), o.company_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.project_documents pd
      JOIN public.orders o ON o.id = pd.order_id
      JOIN public.production_stages ps ON ps.order_id = o.id
      JOIN public.vendors v ON ps.vendor_id = v.id
      WHERE pd.file_path = name
        AND v.user_id = auth.uid()
    )
  )
);

-- ============================================================
-- 3. Fix quote-documents: restrict to vibe_admin only
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can view quote documents" ON storage.objects;

-- Quote documents are admin-only (quotes feature is vibe_admin restricted)
-- The "Vibe admins can read quote documents" policy already exists

-- ============================================================
-- 4. Fix artwork bucket: restrict uploads to admin/vibe_admin
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can upload artwork" ON storage.objects;

CREATE POLICY "Admins can upload artwork"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'artwork'
  AND (
    has_role(auth.uid(), 'vibe_admin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  )
);
