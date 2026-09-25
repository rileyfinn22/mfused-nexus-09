-- Customer art "action needed" tracking.
--
-- A customer artwork file needs VibePKG's attention until BOTH are true:
--   1. a vibe_admin has opened it (opened_at / opened_by, stamped by the viewer), and
--   2. a vibe_proof exists for the same company + SKU.
-- The Artwork page derives the blue dot from these; nothing here changes approval.

alter table public.artwork_files
  add column if not exists opened_at timestamptz,
  add column if not exists opened_by uuid;

create index if not exists artwork_files_company_sku_type_idx
  on public.artwork_files (company_id, sku, artwork_type);
