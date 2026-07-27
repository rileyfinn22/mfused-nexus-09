CREATE OR REPLACE FUNCTION public.can_access_artwork_storage_file(_user_id uuid, _object_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  clean_name text := split_part(split_part(coalesce(_object_name, ''), '?', 1), '#', 1);
BEGIN
  IF _user_id IS NULL OR clean_name = '' THEN
    RETURN false;
  END IF;

  IF public.has_role(_user_id, 'vibe_admin'::public.app_role)
     OR public.has_role(_user_id, 'admin'::public.app_role) THEN
    RETURN true;
  END IF;

  IF clean_name LIKE 'demo/%' THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.artwork_files af
    WHERE public.user_has_company_access(_user_id, af.company_id)
      AND (
        clean_name = split_part(split_part(coalesce(af.artwork_url, ''), '?', 1), '#', 1)
        OR clean_name = split_part(split_part(coalesce(af.preview_url, ''), '?', 1), '#', 1)
        OR clean_name = split_part(split_part(split_part(coalesce(af.artwork_url, ''), '/storage/v1/object/public/artwork/', 2), '?', 1), '#', 1)
        OR clean_name = split_part(split_part(split_part(coalesce(af.preview_url, ''), '/storage/v1/object/public/artwork/', 2), '?', 1), '#', 1)
        OR clean_name = split_part(split_part(split_part(coalesce(af.artwork_url, ''), '/storage/v1/object/sign/artwork/', 2), '?', 1), '#', 1)
        OR clean_name = split_part(split_part(split_part(coalesce(af.preview_url, ''), '/storage/v1/object/sign/artwork/', 2), '?', 1), '#', 1)
        OR clean_name = split_part(split_part(split_part(coalesce(af.artwork_url, ''), '/storage/v1/object/authenticated/artwork/', 2), '?', 1), '#', 1)
        OR clean_name = split_part(split_part(split_part(coalesce(af.preview_url, ''), '/storage/v1/object/authenticated/artwork/', 2), '?', 1), '#', 1)
      )
  ) OR EXISTS (
    SELECT 1
    FROM public.rejected_artwork_files raf
    WHERE public.user_has_company_access(_user_id, raf.company_id)
      AND (
        clean_name = split_part(split_part(coalesce(raf.artwork_url, ''), '?', 1), '#', 1)
        OR clean_name = split_part(split_part(coalesce(raf.preview_url, ''), '?', 1), '#', 1)
        OR clean_name = split_part(split_part(split_part(coalesce(raf.artwork_url, ''), '/storage/v1/object/public/artwork/', 2), '?', 1), '#', 1)
        OR clean_name = split_part(split_part(split_part(coalesce(raf.preview_url, ''), '/storage/v1/object/public/artwork/', 2), '?', 1), '#', 1)
        OR clean_name = split_part(split_part(split_part(coalesce(raf.artwork_url, ''), '/storage/v1/object/sign/artwork/', 2), '?', 1), '#', 1)
        OR clean_name = split_part(split_part(split_part(coalesce(raf.preview_url, ''), '/storage/v1/object/sign/artwork/', 2), '?', 1), '#', 1)
        OR clean_name = split_part(split_part(split_part(coalesce(raf.artwork_url, ''), '/storage/v1/object/authenticated/artwork/', 2), '?', 1), '#', 1)
        OR clean_name = split_part(split_part(split_part(coalesce(raf.preview_url, ''), '/storage/v1/object/authenticated/artwork/', 2), '?', 1), '#', 1)
      )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.can_access_artwork_storage_file(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_artwork_storage_file(uuid, text) TO authenticated, service_role;