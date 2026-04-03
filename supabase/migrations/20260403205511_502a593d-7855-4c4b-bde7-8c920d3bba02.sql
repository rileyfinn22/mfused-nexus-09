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

DROP POLICY IF EXISTS "Users can view packing lists for their invoices" ON storage.objects;

CREATE POLICY "Users can view packing lists for their invoices"
ON storage.objects
FOR SELECT
TO public
USING (
  bucket_id = 'packing-lists'
  AND (
    has_role(auth.uid(), 'vibe_admin'::app_role)
    OR EXISTS (
      SELECT 1
      FROM public.invoice_packing_lists AS ipl
      JOIN public.invoices AS i
        ON i.id = ipl.invoice_id
      JOIN public.user_roles AS ur
        ON ur.company_id = i.company_id
      WHERE ur.user_id = auth.uid()
        AND (
          ipl.file_path = storage.objects.name
          OR split_part(ipl.file_path, '#', 1) = storage.objects.name
        )
    )
  )
);