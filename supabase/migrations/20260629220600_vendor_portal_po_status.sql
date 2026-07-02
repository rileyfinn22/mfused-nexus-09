-- Vendor Portal: PO-centric production status, vendor ETA, status history, and vendor RLS.
-- Vendors update status/ETA only via the SECURITY DEFINER RPC (no direct UPDATE on vendor_pos),
-- which structurally prevents them from altering totals, costs, or other vendors' POs.

-- 1. Production status + vendor-committed ETA + delay on the PO itself.
alter table public.vendor_pos
  add column if not exists production_status text not null default 'not_started',
  add column if not exists vendor_committed_ship_date date,
  add column if not exists is_delayed boolean not null default false,
  add column if not exists delay_reason text,
  add column if not exists production_status_updated_at timestamptz,
  add column if not exists production_status_updated_by uuid;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'vendor_pos_production_status_chk') then
    alter table public.vendor_pos add constraint vendor_pos_production_status_chk
      check (production_status in
        ('not_started','in_production','quality_check','ready_to_ship','shipped'));
  end if;
end $$;

-- 2. Status change history ("is each PO moving along?").
create table if not exists public.vendor_po_status_history (
  id uuid primary key default gen_random_uuid(),
  vendor_po_id uuid not null references public.vendor_pos(id) on delete cascade,
  changed_by uuid,
  previous_status text,
  new_status text,
  committed_ship_date date,
  is_delayed boolean,
  delay_reason text,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists idx_vendor_po_status_history_po
  on public.vendor_po_status_history (vendor_po_id, created_at desc);
alter table public.vendor_po_status_history enable row level security;

-- 3. Read gap that made the prior vendor scaffolding dead-on-arrival:
--    a vendor could not even read their own vendors row to resolve vendor_id.
drop policy if exists "Vendors can view their own row" on public.vendors;
create policy "Vendors can view their own row" on public.vendors
  for select to authenticated
  using (user_id = auth.uid());

-- 4. Vendors read their own POs, items, and status history (scoped to their vendor).
drop policy if exists "Vendors view own POs" on public.vendor_pos;
create policy "Vendors view own POs" on public.vendor_pos
  for select to authenticated
  using (
    has_role(auth.uid(), 'vendor'::app_role)
    and vendor_id in (select id from public.vendors where user_id = auth.uid())
  );

drop policy if exists "Vendors view own PO items" on public.vendor_po_items;
create policy "Vendors view own PO items" on public.vendor_po_items
  for select to authenticated
  using (
    exists (
      select 1 from public.vendor_pos p
      join public.vendors v on v.id = p.vendor_id
      where p.id = vendor_po_items.vendor_po_id
        and v.user_id = auth.uid()
        and has_role(auth.uid(), 'vendor'::app_role)
    )
  );

drop policy if exists "Vendors view own PO history" on public.vendor_po_status_history;
create policy "Vendors view own PO history" on public.vendor_po_status_history
  for select to authenticated
  using (
    exists (
      select 1 from public.vendor_pos p
      join public.vendors v on v.id = p.vendor_id
      where p.id = vendor_po_status_history.vendor_po_id
        and v.user_id = auth.uid()
    )
  );

drop policy if exists "Vibe admins view all PO history" on public.vendor_po_status_history;
create policy "Vibe admins view all PO history" on public.vendor_po_status_history
  for select to authenticated
  using (has_role(auth.uid(), 'vibe_admin'::app_role));

-- 5. The only write path for vendors. Verifies ownership, mutates only the
--    status/ETA/delay fields, and logs history atomically.
create or replace function public.vendor_update_po_status(
  p_po_id uuid,
  p_status text,
  p_committed_ship_date date default null,
  p_is_delayed boolean default false,
  p_delay_reason text default null,
  p_note text default null
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev_status text;
begin
  -- Caller must own this PO (vendor linked via vendors.user_id).
  select p.production_status into v_prev_status
  from public.vendor_pos p
  join public.vendors v on v.id = p.vendor_id
  where p.id = p_po_id and v.user_id = auth.uid();

  if not found then
    return json_build_object('success', false, 'error', 'Not authorized for this PO');
  end if;

  if p_status not in ('not_started','in_production','quality_check','ready_to_ship','shipped') then
    return json_build_object('success', false, 'error', 'Invalid status');
  end if;

  update public.vendor_pos set
    production_status = p_status,
    vendor_committed_ship_date = coalesce(p_committed_ship_date, vendor_committed_ship_date),
    is_delayed = p_is_delayed,
    delay_reason = case when p_is_delayed then p_delay_reason else null end,
    production_status_updated_at = now(),
    production_status_updated_by = auth.uid()
  where id = p_po_id;

  insert into public.vendor_po_status_history
    (vendor_po_id, changed_by, previous_status, new_status, committed_ship_date, is_delayed, delay_reason, note)
  values
    (p_po_id, auth.uid(), v_prev_status, p_status, p_committed_ship_date, p_is_delayed, p_delay_reason, p_note);

  return json_build_object('success', true, 'previous_status', v_prev_status, 'new_status', p_status);
end;
$$;

grant execute on function public.vendor_update_po_status(uuid, text, date, boolean, text, text) to authenticated;
