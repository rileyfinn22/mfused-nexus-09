-- Drop the existing check constraint on stage_name
ALTER TABLE public.production_stages DROP CONSTRAINT IF EXISTS production_stages_stage_name_check;

-- Add the updated check constraint that includes 'po_sent'
ALTER TABLE public.production_stages ADD CONSTRAINT production_stages_stage_name_check 
CHECK (stage_name IN ('po_sent', 'production_proceeding_part_1', 'production_proceeding_part_2', 'complete_qc', 'shipped', 'delivered'));