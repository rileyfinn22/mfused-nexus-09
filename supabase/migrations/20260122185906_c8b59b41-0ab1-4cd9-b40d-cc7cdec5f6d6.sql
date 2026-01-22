-- Add internal_notes column to production_stages for Vibe Admin internal notes
ALTER TABLE public.production_stages 
ADD COLUMN internal_notes TEXT;