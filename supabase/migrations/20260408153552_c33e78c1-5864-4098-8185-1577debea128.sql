ALTER TABLE production_stages DISABLE TRIGGER protect_published_stages;
ALTER TABLE production_stage_updates DISABLE TRIGGER protect_published_updates;

UPDATE production_stages 
SET published_status = 'pending', published_at = NULL, published_notes = NULL, published_substages = NULL
WHERE id IN (
  '31d000ca-e398-4532-915b-4eda20741b70',
  'ac55611b-a788-418e-8eb9-ee4b14a188b0',
  'a6a650dc-511d-486b-98a1-2cacc2cbed6c',
  'd13c4eda-9ab6-443c-956b-e124b0ef06ba'
);

UPDATE production_stage_updates
SET is_published = false, published_at = NULL
WHERE stage_id IN (
  '31d000ca-e398-4532-915b-4eda20741b70',
  'ac55611b-a788-418e-8eb9-ee4b14a188b0',
  'a6a650dc-511d-486b-98a1-2cacc2cbed6c',
  'd13c4eda-9ab6-443c-956b-e124b0ef06ba'
);

ALTER TABLE production_stage_updates ENABLE TRIGGER protect_published_updates;
ALTER TABLE production_stages ENABLE TRIGGER protect_published_stages;