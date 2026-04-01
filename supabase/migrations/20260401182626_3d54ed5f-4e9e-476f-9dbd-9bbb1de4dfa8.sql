
-- Add 'forwarder' to the app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'forwarder';

-- Add ocean freight fields to shipment_legs
ALTER TABLE public.shipment_legs
  ADD COLUMN IF NOT EXISTS bl_number text,
  ADD COLUMN IF NOT EXISTS vessel_voyage text,
  ADD COLUMN IF NOT EXISTS etd timestamp with time zone,
  ADD COLUMN IF NOT EXISTS ctns integer,
  ADD COLUMN IF NOT EXISTS pcs_per_ctn integer,
  ADD COLUMN IF NOT EXISTS qty_pcs integer,
  ADD COLUMN IF NOT EXISTS ddp_method text;
