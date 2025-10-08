-- Add vibe_processed field to orders table
ALTER TABLE public.orders 
ADD COLUMN vibe_processed boolean NOT NULL DEFAULT false,
ADD COLUMN vibe_processed_by uuid REFERENCES auth.users(id),
ADD COLUMN vibe_processed_at timestamp with time zone;