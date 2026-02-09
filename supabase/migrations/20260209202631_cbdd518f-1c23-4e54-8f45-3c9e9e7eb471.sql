
ALTER TABLE public.production_stage_updates
DROP CONSTRAINT production_stage_updates_update_type_check;

ALTER TABLE public.production_stage_updates
ADD CONSTRAINT production_stage_updates_update_type_check
CHECK (update_type = ANY (ARRAY['note'::text, 'image'::text, 'status_change'::text, 'file'::text]));
