REVOKE ALL ON FUNCTION public.can_access_artwork_storage_file(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_artwork_storage_file(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_access_artwork_storage_file(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_artwork_storage_file(uuid, text) TO service_role;