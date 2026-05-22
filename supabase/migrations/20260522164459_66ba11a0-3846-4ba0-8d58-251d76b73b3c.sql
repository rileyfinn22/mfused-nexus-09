DELETE FROM public.artwork_files af
USING (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY sku, filename ORDER BY created_at DESC) AS rn
  FROM public.artwork_files
  WHERE sku IS NOT NULL
) dup
WHERE af.id = dup.id AND dup.rn > 1;