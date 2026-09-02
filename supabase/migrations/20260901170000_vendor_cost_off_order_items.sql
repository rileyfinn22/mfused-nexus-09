-- Stop shipping vendor cost to customers.
--
-- order_items.vendor_cost / vendor_id / vendor_po_number are internal-only, but
-- RLS is row-level: any buyer who can read an order row reads every column of it.
-- OrderDetail fetches `select('*, order_items(*)')`, so a customer opening their
-- own order was downloading VibePKG's vendor cost in the response payload.
-- Column GRANTs can't fix this either — every logged-in user shares the single
-- `authenticated` Postgres role.
--
-- The internal-only companion table order_item_costs (vibe_admin/finance RLS)
-- already exists and already holds everything: 1:1 coverage over order_items, no
-- orphans, no gaps, and 445 rows where it retains a cost the base column had
-- already lost. Nothing is lost by emptying the base columns.
--
-- The old trigger copied base -> companion. This replaces it with one that
-- diverts writes into the companion and blanks the base columns, so the columns
-- stay in place (nothing breaks while edge functions catch up) but are always
-- NULL and therefore carry nothing to leak. Dropping them entirely is a
-- follow-up once every writer is deployed.

-- 1. Retire the old mirror trigger.
drop trigger if exists trg_sync_order_item_cost on public.order_items;
drop function if exists public.sync_order_item_cost();

-- 2. Anything written to the base columns is moved to the companion and blanked.
create or replace function public.divert_order_item_cost()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.order_item_costs (
    order_item_id, vendor_cost, vendor_id, vendor_po_number, updated_at
  ) values (
    new.id, new.vendor_cost, new.vendor_id, new.vendor_po_number, now()
  )
  on conflict (order_item_id) do update set
    -- coalesce so a partial write never erases a value the companion already holds
    vendor_cost      = coalesce(excluded.vendor_cost,      order_item_costs.vendor_cost),
    vendor_id        = coalesce(excluded.vendor_id,        order_item_costs.vendor_id),
    vendor_po_number = coalesce(excluded.vendor_po_number, order_item_costs.vendor_po_number),
    updated_at       = now();

  -- Blank the row itself. This re-fires the trigger, but the WHEN clause is then
  -- false (all three are null), so it does not recurse.
  update public.order_items
     set vendor_cost = null,
         vendor_id = null,
         vendor_po_number = null
   where id = new.id;

  return null;
end;
$$;

-- AFTER, not BEFORE: order_item_costs has an FK to order_items(id), so the row
-- must exist before the companion row can reference it.
create trigger trg_divert_order_item_cost
  after insert or update of vendor_cost, vendor_id, vendor_po_number
  on public.order_items
  for each row
  when (
    new.vendor_cost is not null
    or new.vendor_id is not null
    or new.vendor_po_number is not null
  )
  execute function public.divert_order_item_cost();

-- 3. Belt and braces: make sure the companion holds everything the base columns
-- do before the base columns are emptied. (Verified as already true; this is a
-- no-op unless something wrote in between.)
insert into public.order_item_costs (
  order_item_id, vendor_cost, vendor_id, vendor_po_number, updated_at
)
select oi.id, oi.vendor_cost, oi.vendor_id, oi.vendor_po_number, now()
from public.order_items oi
where oi.vendor_cost is not null
   or oi.vendor_id is not null
   or oi.vendor_po_number is not null
on conflict (order_item_id) do update set
  vendor_cost      = coalesce(excluded.vendor_cost,      order_item_costs.vendor_cost),
  vendor_id        = coalesce(excluded.vendor_id,        order_item_costs.vendor_id),
  vendor_po_number = coalesce(excluded.vendor_po_number, order_item_costs.vendor_po_number),
  updated_at       = now();

-- 4. Empty the leaking columns.
update public.order_items
   set vendor_cost = null,
       vendor_id = null,
       vendor_po_number = null
 where vendor_cost is not null
    or vendor_id is not null
    or vendor_po_number is not null;

comment on column public.order_items.vendor_cost is
  'DEPRECATED - always NULL. Vendor cost lives in order_item_costs (vibe_admin/finance only). '
  'Anything written here is diverted by trg_divert_order_item_cost. Column pending removal.';
comment on column public.order_items.vendor_id is
  'DEPRECATED - always NULL. See order_item_costs. Column pending removal.';
comment on column public.order_items.vendor_po_number is
  'DEPRECATED - always NULL. See order_item_costs. Column pending removal.';
