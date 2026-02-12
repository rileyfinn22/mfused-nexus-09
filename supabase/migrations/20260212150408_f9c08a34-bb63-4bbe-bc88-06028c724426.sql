
-- Step 1: Drop old constraint
ALTER TABLE public.production_stages DROP CONSTRAINT IF EXISTS production_stages_stage_name_check;

-- Step 2: Migrate existing data to new stage names FIRST
UPDATE public.production_stages SET stage_name = 'materials_ordered' WHERE stage_name = 'production_proceeding_part_1';
UPDATE public.production_stages SET stage_name = 'pre_press' WHERE stage_name = 'production_proceeding_part_2';
UPDATE public.production_stages SET stage_name = 'production_complete' WHERE stage_name = 'complete_qc';
UPDATE public.production_stages SET stage_name = 'in_transit' WHERE stage_name = 'shipped';

-- Step 3: Add new constraint with 12 stages
ALTER TABLE public.production_stages ADD CONSTRAINT production_stages_stage_name_check
  CHECK (stage_name = ANY (ARRAY[
    'estimate_sent'::text,
    'art_approved'::text,
    'deposit_paid'::text,
    'order_confirmed'::text,
    'po_sent'::text,
    'materials_ordered'::text,
    'pre_press'::text,
    'proof_approved'::text,
    'vendor_deposit'::text,
    'production_complete'::text,
    'in_transit'::text,
    'delivered'::text
  ]));
