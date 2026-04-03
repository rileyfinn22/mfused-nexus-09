CREATE OR REPLACE FUNCTION public.can_access_packing_list_file(_user_id uuid, _object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.invoice_packing_lists AS ipl
    JOIN public.invoices AS i ON i.id = ipl.invoice_id
    WHERE public.user_has_company_access(_user_id, i.company_id)
      AND (
        ipl.file_path = _object_name
        OR split_part(ipl.file_path, '#', 1) = _object_name
      )
  )
$$;

DROP POLICY IF EXISTS "Users can view packing lists for their invoices" ON storage.objects;

CREATE POLICY "Users can view packing lists for their invoices"
ON storage.objects
FOR SELECT
TO public
USING (
  bucket_id = 'packing-lists'
  AND (
    public.has_role(auth.uid(), 'vibe_admin'::public.app_role)
    OR public.can_access_packing_list_file(auth.uid(), name)
  )
);