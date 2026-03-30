
-- Delete the EARLIER duplicate for each SKU (keep the latest created_at per SKU)
DELETE FROM artwork_files
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY sku ORDER BY created_at DESC) as rn
    FROM artwork_files
    WHERE sku ILIKE 'MF-FP-ION-WA-%'
  ) ranked
  WHERE rn > 1
);
