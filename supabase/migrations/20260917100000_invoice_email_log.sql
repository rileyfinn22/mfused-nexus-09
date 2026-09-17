-- When did an invoice actually go out?
--
-- Nothing recorded it: invoices had no sent fields and sent_email_history is only a
-- recipient address book. Finance wants to see whether a deposit invoice was emailed, on
-- what day, and how long payment took from there.
--
-- invoice_email_log: one row per send (invoice, notice, reminder), written by the app right
-- after Resend accepts the message. invoices.first_sent_at / last_sent_at are kept in step
-- by trigger; first_sent_at is the clock start for days-to-pay and never moves on a resend.

create table if not exists public.invoice_email_log (
  id                 uuid primary key default gen_random_uuid(),
  invoice_id         uuid not null references public.invoices(id) on delete cascade,
  company_id         uuid not null references public.companies(id) on delete cascade,
  email_kind         text not null check (email_kind in ('invoice', 'deposit', 'billed_notice', 'payment_due')),
  recipients         text[] not null default '{}',
  subject            text,
  sent_by            uuid,
  sent_by_email      text,
  resend_message_id  text,
  sent_at            timestamptz not null default now(),
  created_at         timestamptz not null default now()
);

create index if not exists invoice_email_log_invoice_id_idx on public.invoice_email_log (invoice_id, sent_at desc);
create index if not exists invoice_email_log_company_id_idx on public.invoice_email_log (company_id);

alter table public.invoices add column if not exists first_sent_at timestamptz;
alter table public.invoices add column if not exists last_sent_at  timestamptz;

-- Keep the invoice's sent dates in step with the log.
create or replace function public.apply_invoice_email_log()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.invoices
     set first_sent_at = least(coalesce(first_sent_at, new.sent_at), new.sent_at),
         last_sent_at  = greatest(coalesce(last_sent_at, new.sent_at), new.sent_at)
   where id = new.invoice_id;
  return new;
end;
$$;

drop trigger if exists trg_invoice_email_log_apply on public.invoice_email_log;
create trigger trg_invoice_email_log_apply
  after insert on public.invoice_email_log
  for each row execute function public.apply_invoice_email_log();

-- Access: VibePKG staff (vibe_admin, finance) read and write; a company's own members can read
-- their invoices' send history (it is their invoice); nobody else.
alter table public.invoice_email_log enable row level security;

drop policy if exists "Staff manage invoice email log" on public.invoice_email_log;
create policy "Staff manage invoice email log"
  on public.invoice_email_log for all to authenticated
  using (public.has_role(auth.uid(), 'vibe_admin'::app_role) or public.has_role(auth.uid(), 'finance'::app_role))
  with check (public.has_role(auth.uid(), 'vibe_admin'::app_role) or public.has_role(auth.uid(), 'finance'::app_role));

drop policy if exists "Company members read their invoice email log" on public.invoice_email_log;
create policy "Company members read their invoice email log"
  on public.invoice_email_log for select to authenticated
  using (public.user_has_company_access(auth.uid(), company_id));
