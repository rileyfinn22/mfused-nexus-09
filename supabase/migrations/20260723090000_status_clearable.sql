-- Allow vendors to clear the status cell (empty string = clear), matching the
-- free-write sheet behavior. Clears are not logged to status history.

CREATE OR REPLACE FUNCTION public.vendor_update_po_status(p_po_id uuid, p_status text, p_committed_ship_date date DEFAULT NULL::date, p_is_delayed boolean DEFAULT false, p_delay_reason text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_prev_status text;
begin
  select p.production_status into v_prev_status
  from public.vendor_pos p
  where p.id = p_po_id
    and (
      public.has_role(auth.uid(), 'vibe_admin'::public.app_role)
      or exists (
        select 1 from public.vendors v
        where v.id = p.vendor_id and v.user_id = auth.uid()
      )
    );

  if not found then
    return json_build_object('success', false, 'error', 'Not authorized for this PO');
  end if;

  if p_status is not null and length(p_status) > 120 then
    return json_build_object('success', false, 'error', 'Invalid status');
  end if;

  -- Empty/null = clear the status.
  if p_status is null or length(trim(p_status)) = 0 then
    update public.vendor_pos set
      production_status = null,
      production_status_updated_at = now(),
      production_status_updated_by = auth.uid()
    where id = p_po_id;
    return json_build_object('success', true, 'previous_status', v_prev_status, 'new_status', null);
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
$function$;
