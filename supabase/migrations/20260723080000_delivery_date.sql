-- Free-write Delivery date column on the vendor sheet (next to Completion date).

ALTER TABLE public.vendor_pos ADD COLUMN IF NOT EXISTS delivery_date text;

-- Signature changes (new param) — drop the old overload first.
DROP FUNCTION IF EXISTS public.vendor_update_po_details(uuid, text, text, text, text, text, text, text, text, text, text, text, text, boolean, integer);

CREATE OR REPLACE FUNCTION public.vendor_update_po_details(
  p_po_id uuid,
  p_tracking_carrier text default null,
  p_tracking_number text default null,
  p_tracking_url text default null,
  p_notes text default null,
  p_completion_date text default null,
  p_vendor_invoice_number text default null,
  p_sheet_description text default null,
  p_ship_to_name text default null,
  p_ship_to_street text default null,
  p_ship_to_city text default null,
  p_ship_to_state text default null,
  p_ship_to_zip text default null,
  p_sheet_completed boolean default null,
  p_production_percent integer default null,
  p_delivery_date text default null
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

  -- Convention for every text param: null = leave as-is, '' = clear, else set.
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
    delivery_date    = case when p_delivery_date is null then delivery_date
                            when trim(p_delivery_date) = '' then null
                            else p_delivery_date end,
    vendor_invoice_number = case when p_vendor_invoice_number is null then vendor_invoice_number
                                 when trim(p_vendor_invoice_number) = '' then null
                                 else p_vendor_invoice_number end,
    sheet_description = case when p_sheet_description is null then sheet_description
                             when trim(p_sheet_description) = '' then null
                             else p_sheet_description end,
    ship_to_name   = case when p_ship_to_name is null then ship_to_name
                          when p_ship_to_name = '' then null
                          else p_ship_to_name end,
    ship_to_street = case when p_ship_to_street is null then ship_to_street
                          when p_ship_to_street = '' then null
                          else p_ship_to_street end,
    ship_to_city   = case when p_ship_to_city is null then ship_to_city
                          when p_ship_to_city = '' then null
                          else p_ship_to_city end,
    ship_to_state  = case when p_ship_to_state is null then ship_to_state
                          when p_ship_to_state = '' then null
                          else p_ship_to_state end,
    ship_to_zip    = case when p_ship_to_zip is null then ship_to_zip
                          when p_ship_to_zip = '' then null
                          else p_ship_to_zip end,
    sheet_completed_at = case when p_sheet_completed is null then sheet_completed_at
                              when p_sheet_completed then coalesce(sheet_completed_at, now())
                              else null end,
    production_percent = case when p_production_percent is null then production_percent
                              else greatest(0, least(100, p_production_percent)) end,
    vendor_committed_ship_date = coalesce(v_synced_date, vendor_committed_ship_date),
    updated_at = now()
  where id = p_po_id;

  return json_build_object('success', true);
end;
$$;

grant execute on function public.vendor_update_po_details(uuid, text, text, text, text, text, text, text, text, text, text, text, text, boolean, integer, text) to authenticated;
