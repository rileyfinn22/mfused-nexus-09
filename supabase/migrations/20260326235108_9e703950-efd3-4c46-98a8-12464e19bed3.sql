
-- Add published columns to production_stages
ALTER TABLE public.production_stages
  ADD COLUMN IF NOT EXISTS published_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS published_substages jsonb,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_notes text;

-- Add published columns to production_stage_updates
ALTER TABLE public.production_stage_updates
  ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_note_text text,
  ADD COLUMN IF NOT EXISTS published_image_url text;

-- Create trigger to restrict published_* columns to vibe_admin only
CREATE OR REPLACE FUNCTION public.protect_published_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- If published fields changed, verify user is vibe_admin
  IF TG_TABLE_NAME = 'production_stages' THEN
    IF (OLD.published_status IS DISTINCT FROM NEW.published_status
        OR OLD.published_substages IS DISTINCT FROM NEW.published_substages
        OR OLD.published_at IS DISTINCT FROM NEW.published_at
        OR OLD.published_notes IS DISTINCT FROM NEW.published_notes) THEN
      IF NOT has_role(auth.uid(), 'vibe_admin') THEN
        RAISE EXCEPTION 'Only vibe_admin can modify published fields';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'production_stage_updates' THEN
    IF (OLD.is_published IS DISTINCT FROM NEW.is_published
        OR OLD.published_at IS DISTINCT FROM NEW.published_at
        OR OLD.published_note_text IS DISTINCT FROM NEW.published_note_text
        OR OLD.published_image_url IS DISTINCT FROM NEW.published_image_url) THEN
      IF NOT has_role(auth.uid(), 'vibe_admin') THEN
        RAISE EXCEPTION 'Only vibe_admin can modify published fields';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_published_stages
  BEFORE UPDATE ON public.production_stages
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_published_fields();

CREATE TRIGGER protect_published_updates
  BEFORE UPDATE ON public.production_stage_updates
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_published_fields();
