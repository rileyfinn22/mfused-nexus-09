-- Completion date on the vendor sheet is free text like a spreadsheet cell.
-- Store the raw text in vendor_pos.completion_date; when it happens to parse
-- as a date we also sync vendor_committed_ship_date so date-based views keep
-- working. Vendor RPCs additionally allow vibe_admins (admins were locked out
-- of saving on the vendor portal page by the ownership check).

ALTER TABLE public.vendor_pos ADD COLUMN IF NOT EXISTS completion_date text;

-- Signature changes (new param) — drop the old overload first.
DROP FUNCTION IF EXISTS public.vendor_update_po_details(uuid, text, text, text, text);

CREATE OR REPLACE FUNCTION public.vendor_update_po_details(
  p_po_id uuid,
  p_tracking_carrier text default null,
  p_tracking_number text default null,
  p_tracking_url text default null,
  p_notes text default null,
  p_completion_date text default null
)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_synced_date date;
begin
  -- Caller must own this PO (vendor linked via vendors.user_id) or be a vibe admin.
  perform 1
  from public.vendor_pos p
  join public.vendors v on v.id = p.vendor_id
  where p.id = p_po_id and v.user_id = auth.uid();

  if not found and not public.has_role(auth.uid(), 'vibe_admin'::public.app_role) then
    return json_build_object('success', false, 'error', 'Not authorized for this PO');
  end if;

  if p_completion_date is not null and length(trim(p_completion_date)) > 0 then
    begin
      v_synced_date := trim(p_completion_date)::date;
    exception when others then
      v_synced_date := null;
    end;
  end if;

  update public.vendor_pos set
    tracking_carrier = case when p_tracking_carrier is null then tracking_carrier
                            when p_tracking_carrier = '' then null
                            else p_tracking_carrier end,
    tracking_number  = case when p_tracking_number is null then tracking_number
                            when p_tracking_number = '' then null
                            else p_tracking_number end,
    tracking_url     = case when p_tracking_url is null then tracking_url
                            when p_tracking_url = '' then null
                            else p_tracking_url end,
    notes            = case when p_notes is null then notes
                            when p_notes = '' then null
                            else p_notes end,
    completion_date  = case when p_completion_date is null then completion_date
                            when trim(p_completion_date) = '' then null
                            else p_completion_date end,
    vendor_committed_ship_date = coalesce(v_synced_date, vendor_committed_ship_date),
    updated_at = now()
  where id = p_po_id;

  return json_build_object('success', true);
end;
$$;

grant execute on function public.vendor_update_po_details(uuid, text, text, text, text, text) to authenticated;

-- Same signature, body change only: vibe admins may also set status.
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
$function$;
