ALTER TABLE public.vendor_pos
  ADD COLUMN tracking_carrier text,
  ADD COLUMN tracking_number text,
  ADD COLUMN tracking_url text;