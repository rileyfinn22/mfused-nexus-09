DROP POLICY IF EXISTS "Company users can upload product images" ON storage.objects;
CREATE POLICY "Company users can upload product images" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'product-images' AND (
  public.has_role(auth.uid(), 'vibe_admin'::public.app_role)
  OR ((storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND public.user_has_company_access(auth.uid(), ((storage.foldername(name))[1])::uuid))
));

DROP POLICY IF EXISTS "Scoped users can view product images" ON storage.objects;
CREATE POLICY "Scoped users can view product images" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'product-images' AND (
  public.has_role(auth.uid(), 'vibe_admin'::public.app_role)
  OR ((storage.foldername(name))[1] = 'template-thumbnails'
      AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()))
  OR ((storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND public.user_has_company_access(auth.uid(), ((storage.foldername(name))[1])::uuid))
));