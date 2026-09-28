create or replace function public.alert_on_vendor_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    -- only the no-login shipment link writes shipment_legs without a user
    if tg_table_name <> 'shipment_legs' then return new; end if;
  elsif not public.has_role(v_uid, 'vendor') or public.has_role(v_uid, 'vibe_admin') then
    return new;
  end if;
  perform public.queue_internal_alert('vendor_update:' || tg_table_name, new.id, null);
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists trg_vendor_alert on public.vendor_po_status_history;
create trigger trg_vendor_alert after insert on public.vendor_po_status_history for each row execute function public.alert_on_vendor_update();
drop trigger if exists trg_vendor_alert on public.vendor_po_production_updates;
create trigger trg_vendor_alert after insert on public.vendor_po_production_updates for each row execute function public.alert_on_vendor_update();
drop trigger if exists trg_vendor_alert on public.vendor_po_packing_lists;
create trigger trg_vendor_alert after insert on public.vendor_po_packing_lists for each row execute function public.alert_on_vendor_update();
drop trigger if exists trg_vendor_alert on public.production_stage_updates;
create trigger trg_vendor_alert after insert on public.production_stage_updates for each row execute function public.alert_on_vendor_update();
drop trigger if exists trg_vendor_alert on public.shipment_legs;
create trigger trg_vendor_alert after insert on public.shipment_legs for each row execute function public.alert_on_vendor_update();