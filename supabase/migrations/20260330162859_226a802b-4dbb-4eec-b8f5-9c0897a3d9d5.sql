
UPDATE artwork_files
SET is_approved = true, approved_at = now(), updated_at = now()
WHERE company_id IN (SELECT id FROM companies WHERE name ILIKE '%mfused%')
  AND sku NOT ILIKE 'MF-FP-ION-WA-%'
  AND is_approved = false;
