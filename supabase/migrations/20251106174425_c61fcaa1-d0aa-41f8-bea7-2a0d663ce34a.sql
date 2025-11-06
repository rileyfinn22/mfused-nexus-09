-- Add vibeNotes column to orders table to store notes as JSON array
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS vibeNotes JSONB DEFAULT '[]'::jsonb;