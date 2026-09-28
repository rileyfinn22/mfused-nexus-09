alter table public.orders add column if not exists sales_rep_email text;
alter table public.quotes add column if not exists sales_rep_email text;