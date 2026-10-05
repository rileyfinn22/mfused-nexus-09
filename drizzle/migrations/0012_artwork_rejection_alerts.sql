alter table public.rejected_artwork_files add column if not exists artwork_type text;

create or replace function public.alert_on_artwork_rejected()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.rejection_reason is null or new.rejection_reason ilike 'Archived%' then
    return new;
  end if;
  perform public.queue_internal_alert('artwork_rejected', new.id, new.company_id);
  return new;
end $$;

drop trigger if exists trg_rejected_artwork_alert on public.rejected_artwork_files;
create trigger trg_rejected_artwork_alert after insert on public.rejected_artwork_files
for each row execute function public.alert_on_artwork_rejected();

revoke execute on function public.alert_on_artwork_rejected() from public, anon, authenticated;

create or replace function public.alert_on_customer_artwork()
 returns trigger language plpgsql security definer set search_path to 'public' as $function$
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
  select ur.user_id, new.company_id, 'customer_artwork',
         'New customer artwork for ' || new.sku,
         coalesce(v_company, 'A customer') || ' uploaded ' || coalesce(new.filename, 'a file')
           || ' for ' || new.sku || ' and it is awaiting review.',
         '/artwork?tab=customer&sku=' || new.sku,
         false
    from (select distinct user_id from public.user_roles where role = 'vibe_admin') ur;

  perform public.queue_internal_alert('artwork_uploaded', new.id, new.company_id);
  return new;
end;
$function$;