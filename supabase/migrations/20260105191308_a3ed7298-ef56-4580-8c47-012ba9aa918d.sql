-- Add file_url column to production_stage_updates for PDF/Excel attachments
ALTER TABLE public.production_stage_updates 
ADD COLUMN IF NOT EXISTS file_url TEXT,
ADD COLUMN IF NOT EXISTS file_name TEXT;