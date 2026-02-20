
-- Add attachment fields to shipment_legs
ALTER TABLE public.shipment_legs
ADD COLUMN attachment_url text,
ADD COLUMN attachment_name text;
