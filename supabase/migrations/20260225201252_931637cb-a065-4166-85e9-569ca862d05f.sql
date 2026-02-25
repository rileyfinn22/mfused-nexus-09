
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS production_notes text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS is_delayed boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS delay_reason text DEFAULT NULL;
