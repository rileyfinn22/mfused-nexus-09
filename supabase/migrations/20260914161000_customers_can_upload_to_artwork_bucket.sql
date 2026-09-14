-- Second half of letting customers add their own artwork (see 20260914160000 for the table
-- policy). The artwork BUCKET's insert policy is admin-only too:
--
--   "Admins can upload artwork": bucket_id = 'artwork' AND (vibe_admin OR admin)
--
-- so a customer's file is refused before the row is ever attempted.
--
-- The existing read helper (can_access_artwork_storage_file) cannot be reused for uploads: it
-- proves access by finding an artwork_files row that points at the object, and at upload time
-- no row exists yet. Uploads are keyed by the path instead. Every artwork object lives under
-- `<SKU>/...` (see src/lib/artworkUpload.ts), so a customer may write into a folder whose name
-- is the item_id of a product belonging to a company they are a member of, and nowhere else.
--
-- NOTE: policies on storage.objects cannot be created through the claude-admin proxy (it is not
-- the table owner). Run this file through Lovable.

CREATE OR REPLACE FUNCTION public.can_upload_artwork_storage_file(_user_id uuid, _object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    _user_id IS NOT NULL
    AND (
      public.has_role(_user_id, 'vibe_admin'::public.app_role)
      OR public.has_role(_user_id, 'admin'::public.app_role)
      OR EXISTS (
        SELECT 1
          FROM public.products p
         WHERE p.item_id = split_part(coalesce(_object_name, ''), '/', 1)
           AND public.user_has_company_access(_user_id, p.company_id)
      )
    );
$function$;

DROP POLICY IF EXISTS "Customers can upload their own artwork" ON storage.objects;

CREATE POLICY "Customers can upload their own artwork"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'artwork'
    AND public.can_upload_artwork_storage_file(auth.uid(), name)
  );
