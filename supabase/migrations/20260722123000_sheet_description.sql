-- Dedicated override field for the vendor sheet's Description column.
-- vendor_pos.description carries auto-generated PO text (adjustment notes etc.)
-- that should not surface on the sheet; sheet edits live here instead, and the
-- linked order's description shows as a grey preset when this is empty.

ALTER TABLE public.vendor_pos ADD COLUMN IF NOT EXISTS sheet_description text;
