CREATE OR REPLACE FUNCTION public.can_upload_artwork_storage_file(_user_id uuid, _object_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  clean_name text := replace(split_part(split_part(coalesce(_object_name, ''), '?', 1), '#', 1), '%20', ' ');
  v_sku text;
BEGIN
  IF _user_id IS NULL OR clean_name = '' THEN
    RETURN false;
  END IF;

  IF public.has_role(_user_id, 'vibe_admin'::public.app_role)
     OR public.has_role(_user_id, 'admin'::public.app_role) THEN
    RETURN true;
  END IF;

  v_sku := split_part(clean_name, '/', 1);
  IF v_sku = '' OR position('/' in clean_name) = 0 THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.item_id = v_sku
      AND public.user_has_company_access(_user_id, p.company_id)
  ) OR EXISTS (
    SELECT 1 FROM public.artwork_files af
    WHERE af.sku = v_sku
      AND public.user_has_company_access(_user_id, af.company_id)
  );
END;
$function$;