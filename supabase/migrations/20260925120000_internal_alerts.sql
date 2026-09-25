-- Internal alerts: tell the VibePKG team when a customer acts in the portal.
--
-- Two channels, both driven from the database so they fire no matter which screen
-- (or script) created the row:
--   1. Bell: one row in public.notifications per vibe_admin (the header dropdown reads it).
--   2. Email: a row in public.internal_alert_log plus a pg_net call to the notify-internal
--      edge function, which looks the record up with the service role, emails every
--      vibe_admin, and marks the log row sent/failed. The unique (event, record_id) key
--      makes the whole thing idempotent — a replayed trigger or a retried HTTP call can
--      never send a second email for the same record.
--
-- Events today:
--   order_submitted   — a customer placed an order through submit_customer_order
--                       (the bell rows for this one are already inserted by that RPC).
--   artwork_uploaded  — a customer (not a vibe_admin) added a 'customer' artwork file.

create table if not exists public.internal_alert_log (
  id          uuid primary key default gen_random_uuid(),
  event       text not null,
  record_id   uuid not null,
  company_id  uuid,
  recipients  text[] not null default '{}',
  status      text not null default 'queued', -- queued | sent | failed | skipped
  error       text,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz,
  unique (event, record_id)
);

alter table public.internal_alert_log enable row level security;

drop policy if exists "Vibe admins can view internal alert log" on public.internal_alert_log;
create policy "Vibe admins can view internal alert log"
  on public.internal_alert_log
  for select
  using (public.has_role(auth.uid(), 'vibe_admin'));

-- Queue one alert and hand it to the edge function. Never raises: a broken HTTP hop must
-- not block the customer's order or upload, so failures are recorded on the log row instead.
create or replace function public.queue_internal_alert(p_event text, p_record_id uuid, p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.internal_alert_log (event, record_id, company_id)
  values (p_event, p_record_id, p_company_id)
  on conflict (event, record_id) do nothing
  returning id into v_id;

  if v_id is null then
    return; -- already queued for this record
  end if;

  begin
    perform net.http_post(
      url     := 'https://spxdyqdygsmzyngrqxni.supabase.co/functions/v1/notify-internal',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNweGR5cWR5Z3NtenluZ3JxeG5pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk3NjE5MTQsImV4cCI6MjA3NTMzNzkxNH0.SdfBMwipD6Ml89YbbR-Z4bu_iblYam4MAWu2ujy4OxA"}'::jsonb,
      body    := jsonb_build_object('alert_id', v_id)
    );
  exception when others then
    update public.internal_alert_log
       set status = 'failed', error = 'http_post: ' || sqlerrm
     where id = v_id;
  end;
end;
$$;

revoke all on function public.queue_internal_alert(text, uuid, uuid) from public, anon, authenticated;

-- 1. Customer placed an order.
create or replace function public.alert_on_customer_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.submitted_by_customer then
    perform public.queue_internal_alert('order_submitted', new.id, new.company_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orders_customer_alert on public.orders;
create trigger trg_orders_customer_alert
  after insert on public.orders
  for each row
  execute function public.alert_on_customer_order();

-- 2. Customer uploaded artwork. Skipped when a vibe_admin adds customer art on the
--    customer's behalf, or when a service-role job (no auth.uid()) imports files.
create or replace function public.alert_on_customer_artwork()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_company text;
begin
  if coalesce(new.artwork_type, '') <> 'customer'
     or v_uid is null
     or public.has_role(v_uid, 'vibe_admin') then
    return new;
  end if;

  select name into v_company from public.companies where id = new.company_id;

  insert into public.notifications (user_id, company_id, type, title, message, link, read)
  select ur.user_id,
         new.company_id,
         'customer_artwork',
         'New customer artwork for ' || new.sku,
         coalesce(v_company, 'A customer') || ' uploaded ' || coalesce(new.filename, 'a file')
           || ' for ' || new.sku || ' and it is awaiting review.',
         '/artwork?search=' || new.sku,
         false
    from (select distinct user_id from public.user_roles where role = 'vibe_admin') ur;

  perform public.queue_internal_alert('artwork_uploaded', new.id, new.company_id);
  return new;
end;
$$;

drop trigger if exists trg_artwork_customer_alert on public.artwork_files;
create trigger trg_artwork_customer_alert
  after insert on public.artwork_files
  for each row
  execute function public.alert_on_customer_artwork();

-- Who gets the EMAIL. The bell goes to every vibe_admin; the email only to the admins
-- listed here (must also hold vibe_admin — notify-internal intersects the two).
create table if not exists public.internal_alert_subscribers (
  user_id    uuid primary key,
  created_at timestamptz not null default now()
);

alter table public.internal_alert_subscribers enable row level security;

drop policy if exists "Vibe admins can view internal alert subscribers" on public.internal_alert_subscribers;
create policy "Vibe admins can view internal alert subscribers"
  on public.internal_alert_subscribers
  for select
  using (public.has_role(auth.uid(), 'vibe_admin'));

insert into public.internal_alert_subscribers (user_id)
select u.id
  from auth.users u
 where lower(u.email) in ('riley@vibepkg.com', 'carrie@vibepkg.com', 'taz@vibepkg.com')
on conflict (user_id) do nothing;

-- Retry. pg_net is fire-and-forget: if the edge function was down (or not yet deployed)
-- the row stays 'queued'. Every 5 minutes re-post anything queued for more than 2 minutes
-- and less than 3 days. notify-internal skips rows that are no longer 'queued', so a
-- retry can never double-send.
create or replace function public.retry_internal_alerts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r     record;
  n     integer := 0;
begin
  for r in
    select id
      from public.internal_alert_log
     where status = 'queued'
       and created_at < now() - interval '2 minutes'
       and created_at > now() - interval '3 days'
     order by created_at
     limit 20
  loop
    begin
      perform net.http_post(
        url     := 'https://spxdyqdygsmzyngrqxni.supabase.co/functions/v1/notify-internal',
        headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNweGR5cWR5Z3NtenluZ3JxeG5pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk3NjE5MTQsImV4cCI6MjA3NTMzNzkxNH0.SdfBMwipD6Ml89YbbR-Z4bu_iblYam4MAWu2ujy4OxA"}'::jsonb,
        body    := jsonb_build_object('alert_id', r.id)
      );
      n := n + 1;
    exception when others then
      update public.internal_alert_log
         set error = 'retry http_post: ' || sqlerrm
       where id = r.id;
    end;
  end loop;
  return n;
end;
$$;

revoke all on function public.retry_internal_alerts() from public, anon, authenticated;

select cron.schedule(
  'internal-alerts-retry',
  '*/5 * * * *',
  $$ select public.retry_internal_alerts(); $$
);
