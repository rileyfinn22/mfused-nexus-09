-- Add upload tracking fields to inventory table
ALTER TABLE public.inventory 
ADD COLUMN upload_batch_id uuid DEFAULT gen_random_uuid(),
ADD COLUMN upload_timestamp timestamp with time zone DEFAULT now();

-- Create index for faster batch queries
CREATE INDEX idx_inventory_upload_batch ON public.inventory(upload_batch_id);