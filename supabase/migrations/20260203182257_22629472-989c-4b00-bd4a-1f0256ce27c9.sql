-- Add a manual art approval override field to orders table
-- This allows admins to manually mark art as approved even if not all artwork files are approved
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS art_approved_manually boolean NOT NULL DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS art_approved_manually_by uuid;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS art_approved_manually_at timestamp with time zone;