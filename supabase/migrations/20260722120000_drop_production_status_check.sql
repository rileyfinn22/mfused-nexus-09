-- production_status is free text on the vendor sheet (spreadsheet-style entry).
-- Drop the whitelist check constraint; canonical values still get badge styling
-- in the UI, anything else is stored and displayed as typed.

ALTER TABLE public.vendor_pos DROP CONSTRAINT IF EXISTS vendor_pos_production_status_chk;
