-- The vendor sheet lets vendors and admins free-write production status like a
-- spreadsheet cell. production_status is plain text with no check constraint;
-- drop this RPC's hardcoded whitelist and keep a basic sanity check instead.
-- Canonical values (not_started/in_production/quality_check/ready_to_ship/shipped)
-- still get badge styling + filter chips in the UI; anything else displays as-is.

CREATE OR REPLACE FUNCTION public.vendor_update_po_status(p_po_id uuid, p_status text, p_committed_ship_date date DEFAULT NULL::date, p_is_delayed boolean DEFAULT false, p_delay_reason text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  if p_status is null or length(trim(p_status)) = 0 or length(p_status) > 120 then
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
$function$
