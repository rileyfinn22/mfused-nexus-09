UPDATE public.invoice_packing_lists AS ipl
SET file_path = split_part(ipl.file_path, '#', 1)
WHERE ipl.file_path LIKE '%#%'
  AND EXISTS (
    SELECT 1
    FROM storage.objects AS so
    WHERE so.bucket_id = 'packing-lists'
      AND so.name = split_part(ipl.file_path, '#', 1)
  )
  AND NOT EXISTS (
    SELECT 1
    FROM storage.objects AS so
    WHERE so.bucket_id = 'packing-lists'
      AND so.name = ipl.file_path
  );

DROP POLICY IF EXISTS "Users can view packing lists for their invoices" ON public.invoice_packing_lists;

CREATE POLICY "Users can view packing lists for their invoices"
ON public.invoice_packing_lists
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1
    FROM public.invoices AS i
    WHERE i.id = invoice_packing_lists.invoice_id
      AND public.user_has_company_access(auth.uid(), i.company_id)
  )
);

DROP POLICY IF EXISTS "Users can view packing lists for their invoices" ON storage.objects;

CREATE POLICY "Users can view packing lists for their invoices"
ON storage.objects
FOR SELECT
TO public
USING (
  bucket_id = 'packing-lists'
  AND (
    public.has_role(auth.uid(), 'vibe_admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.invoice_packing_lists AS ipl
      JOIN public.invoices AS i
        ON i.id = ipl.invoice_id
      WHERE public.user_has_company_access(auth.uid(), i.company_id)
        AND (
          ipl.file_path = storage.objects.name
          OR split_part(ipl.file_path, '#', 1) = storage.objects.name
        )
    )
  )
);