-- Vendor document uploads on the PO page: packing list, order proofs, and
-- shipped qty sheet. Reuses vendor_po_production_updates with a kind tag
-- ('update' = plain production note/attachment).

ALTER TABLE public.vendor_po_production_updates
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'update';
