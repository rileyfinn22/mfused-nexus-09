alter table public.orders alter column created_by set default auth.uid();

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
  perform public.queue_internal_alert('order_created', new.id, new.company_id);
  return new;
end;
$$;