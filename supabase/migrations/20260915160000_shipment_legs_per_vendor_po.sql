-- Shipment tracking per vendor PO.
--
-- shipment_legs already models the whole journey (international / customs / domestic legs with
-- carrier, tracking number, vessel & voyage, ETD/ETA, status) but hangs off orders only, and
-- nothing customer-facing shows it. The production sheet and its Details page are per vendor
-- PO, so legs can now belong to a PO directly. Order-level legs keep working unchanged.
--
-- A leg must belong to an order or a PO (or both).

alter table public.shipment_legs
  add column if not exists vendor_po_id uuid references public.vendor_pos(id) on delete cascade;

create index if not exists shipment_legs_vendor_po_id_idx on public.shipment_legs (vendor_po_id);

alter table public.shipment_legs alter column order_id drop not null;

alter table public.shipment_legs drop constraint if exists shipment_legs_parent_check;
alter table public.shipment_legs
  add constraint shipment_legs_parent_check check (order_id is not null or vendor_po_id is not null);
