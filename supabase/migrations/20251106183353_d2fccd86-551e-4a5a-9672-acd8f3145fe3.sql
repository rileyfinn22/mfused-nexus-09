-- Drop the old check constraint
ALTER TABLE production_stages DROP CONSTRAINT IF EXISTS production_stages_stage_name_check;

-- Add new check constraint with the updated stage names
ALTER TABLE production_stages ADD CONSTRAINT production_stages_stage_name_check 
CHECK (stage_name = ANY (ARRAY[
  'production_proceeding_part_1'::text,
  'production_proceeding_part_2'::text,
  'complete_qc'::text,
  'shipped'::text,
  'delivered'::text
]));