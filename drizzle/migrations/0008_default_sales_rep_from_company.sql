create or replace function public.default_sales_rep_from_company()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.sales_rep_email is null and new.company_id is not null then
    select sales_rep_email into new.sales_rep_email from public.companies where id = new.company_id;
  end if;
  return new;
end;
$$;
revoke all on function public.default_sales_rep_from_company() from public, anon, authenticated;

drop trigger if exists trg_orders_default_sales_rep on public.orders;
create trigger trg_orders_default_sales_rep before insert on public.orders
  for each row execute function public.default_sales_rep_from_company();

drop trigger if exists trg_quotes_default_sales_rep on public.quotes;
create trigger trg_quotes_default_sales_rep before insert on public.quotes
  for each row execute function public.default_sales_rep_from_company();