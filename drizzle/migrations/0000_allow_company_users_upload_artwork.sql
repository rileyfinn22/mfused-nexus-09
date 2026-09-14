create or replace function public.can_upload_artwork_storage_file(_user_id uuid, _object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
DECLARE
  clean_name text := replace(split_part(split_part(coalesce(_object_name, ''), '?', 1), '#', 1), '%20', ' ');
  sku text;
BEGIN
  IF _user_id IS NULL OR clean_name = '' THEN
    RETURN false;
  END IF;

  IF public.has_role(_user_id, 'vibe_admin'::public.app_role)
     OR public.has_role(_user_id, 'admin'::public.app_role) THEN
    RETURN true;
  END IF;

  sku := split_part(clean_name, '/', 1);
  IF sku = '' OR position('/' in clean_name) = 0 THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.item_id = sku
      AND public.user_has_company_access(_user_id, p.company_id)
  ) OR EXISTS (
    SELECT 1 FROM public.artwork_files af
    WHERE af.sku = sku
      AND public.user_has_company_access(_user_id, af.company_id)
  );
END;
$$;

drop policy if exists "Company users can upload artwork" on storage.objects;
create policy "Company users can upload artwork"
on storage.objects for insert to authenticated
with check (bucket_id = 'artwork' AND public.can_upload_artwork_storage_file(auth.uid(), name));
