-- Backfill "sent" for invoices that went out before the email log existed.
--
-- Nothing recorded the emails themselves, but invoice_audit_log keeps full row snapshots,
-- and an invoice flips open -> billed at the moment it is synced to QuickBooks and issued.
-- That is the closest thing to "went out" in the history, so each such invoice gets one
-- inferred log row at that instant. Rows are marked source = 'status_history' so the UI can
-- say so, recipients are unknown (empty), and they can be removed in one statement if a
-- better source ever turns up.

alter table public.invoice_email_log
  add column if not exists source text not null default 'app';

insert into public.invoice_email_log (invoice_id, company_id, email_kind, recipients, subject, sent_at, source)
select
  i.id,
  i.company_id,
  case
    when i.billed_percentage is not null and i.billed_percentage > 0 and i.billed_percentage < 100 then 'deposit'
    else 'invoice'
  end,
  '{}'::text[],
  'Inferred from billing status (invoice marked billed)',
  t.billed_at,
  'status_history'
from (
  select invoice_id, min(changed_at) as billed_at
    from public.invoice_audit_log
   where action = 'updated'
     and changes->'old'->>'status' = 'open'
     and changes->'new'->>'status' in ('billed', 'due')
   group by invoice_id
) t
join public.invoices i on i.id = t.invoice_id
where i.deleted_at is null
  and i.first_sent_at is null
  and not exists (
    select 1 from public.invoice_email_log l where l.invoice_id = i.id
  );

-- Invoices that were created already billed (no open -> billed row): fall back to the
-- QuickBooks issue time, else the invoice date.
insert into public.invoice_email_log (invoice_id, company_id, email_kind, recipients, subject, sent_at, source)
select
  i.id,
  i.company_id,
  case
    when i.billed_percentage is not null and i.billed_percentage > 0 and i.billed_percentage < 100 then 'deposit'
    else 'invoice'
  end,
  '{}'::text[],
  case when i.quickbooks_synced_at is not null
       then 'Inferred from QuickBooks issue time'
       else 'Inferred from invoice date' end,
  coalesce(i.quickbooks_synced_at, i.invoice_date, i.created_at),
  'status_history'
from public.invoices i
where i.deleted_at is null
  and i.status in ('billed', 'due', 'paid', 'partial')
  and i.first_sent_at is null
  and not exists (
    select 1 from public.invoice_email_log l where l.invoice_id = i.id
  );
