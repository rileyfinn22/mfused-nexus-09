CREATE OR REPLACE FUNCTION public.can_access_artwork_storage_file(_user_id uuid, _object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'vibe_admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.artwork_files af
      WHERE public.user_has_company_access(_user_id, af.company_id)
        AND (
          af.artwork_url = _object_name
          OR af.preview_url = _object_name
          OR split_part(af.artwork_url, '#', 1) = _object_name
          OR split_part(af.preview_url, '#', 1) = _object_name
          OR split_part(split_part(af.artwork_url, '?', 1), '#', 1) = _object_name
          OR split_part(split_part(af.preview_url, '?', 1), '#', 1) = _object_name
          OR split_part(split_part(af.artwork_url, '/storage/v1/object/public/artwork/', 2), '?', 1) = _object_name
          OR split_part(split_part(af.preview_url, '/storage/v1/object/public/artwork/', 2), '?', 1) = _object_name
          OR split_part(split_part(af.artwork_url, '/storage/v1/object/sign/artwork/', 2), '?', 1) = _object_name
          OR split_part(split_part(af.preview_url, '/storage/v1/object/sign/artwork/', 2), '?', 1) = _object_name
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.rejected_artwork_files raf
      WHERE public.user_has_company_access(_user_id, raf.company_id)
        AND (
          raf.artwork_url = _object_name
          OR raf.preview_url = _object_name
          OR split_part(raf.artwork_url, '#', 1) = _object_name
          OR split_part(raf.preview_url, '#', 1) = _object_name
          OR split_part(split_part(raf.artwork_url, '?', 1), '#', 1) = _object_name
          OR split_part(split_part(raf.preview_url, '?', 1), '#', 1) = _object_name
          OR split_part(split_part(raf.artwork_url, '/storage/v1/object/public/artwork/', 2), '?', 1) = _object_name
          OR split_part(split_part(raf.preview_url, '/storage/v1/object/public/artwork/', 2), '?', 1) = _object_name
          OR split_part(split_part(raf.artwork_url, '/storage/v1/object/sign/artwork/', 2), '?', 1) = _object_name
          OR split_part(split_part(raf.preview_url, '/storage/v1/object/sign/artwork/', 2), '?', 1) = _object_name
        )
    )
$$;

DROP POLICY IF EXISTS "Company users can view artwork files" ON storage.objects;

CREATE POLICY "Company users can view artwork files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'artwork'
  AND public.can_access_artwork_storage_file(auth.uid(), name)
);

DROP POLICY IF EXISTS "Admins can delete artwork" ON storage.objects;
CREATE POLICY "Admins can delete artwork"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'artwork'
  AND (
    public.has_role(auth.uid(), 'vibe_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
);

DROP POLICY IF EXISTS "Admins can update artwork" ON storage.objects;
CREATE POLICY "Admins can update artwork"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'artwork'
  AND (
    public.has_role(auth.uid(), 'vibe_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
)
WITH CHECK (
  bucket_id = 'artwork'
  AND (
    public.has_role(auth.uid(), 'vibe_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
);

GRANT EXECUTE ON FUNCTION public.can_access_artwork_storage_file(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_artwork_storage_file(uuid, text) TO service_role;