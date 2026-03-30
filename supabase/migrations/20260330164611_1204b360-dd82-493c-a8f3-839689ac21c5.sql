
ALTER TABLE public.print_templates
  ADD COLUMN IF NOT EXISTS depth_inches NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS panel_zones JSONB DEFAULT '[]'::jsonb;
