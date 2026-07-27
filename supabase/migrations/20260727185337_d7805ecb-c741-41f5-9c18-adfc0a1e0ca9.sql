REVOKE ALL ON FUNCTION public.can_access_production_image(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_production_image(uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.can_access_print_file(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_print_file(uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.can_access_artwork_storage_file(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_artwork_storage_file(uuid, text) TO authenticated, service_role;