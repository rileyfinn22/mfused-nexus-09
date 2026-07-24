INSERT INTO public.rejected_artwork_files (original_artwork_id, company_id, sku, filename, artwork_url, preview_url, notes, rejection_reason, original_created_at)
SELECT id, company_id, sku, filename, artwork_url, preview_url, notes, 'Removed by admin request', created_at
FROM public.artwork_files
WHERE id = 'd34d1d32-e7a7-42d8-94ac-f0e224060d5e';

DELETE FROM public.artwork_files WHERE id = 'd34d1d32-e7a7-42d8-94ac-f0e224060d5e';