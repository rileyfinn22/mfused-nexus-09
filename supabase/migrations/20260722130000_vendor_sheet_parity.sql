-- Vendor sheet parity: vendors can see the Vibe invoice number(s) + CPO +
-- order description for their own POs, and can edit ship-to and the sheet
-- description. Exposure is via an ownership-checked SECURITY DEFINER function
-- returning ONLY those fields — vendors still have no read access to the
-- orders/invoices tables themselves (no amounts, no customer data).

CREATE OR REPLACE FUNCTION public.vendor_po_sheet_info(p_po_ids uuid[])
RETURNS TABLE (po_id uuid, cpo text, order_description text, invoice_numbers text[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  select
    p.id,
    o.po_number,
    o.description,
    coalesce(
      (select array_agg(distinct i.invoice_number)
       from public.invoices i
       where i.order_id = o.id
         and i.deleted_at is null
         and i.invoice_number is not null),
      '{}'::text[]
    )
  from public.vendor_pos p
  left join public.orders o on o.id = p.order_id
  where p.id = any(p_po_ids)
    and (
      public.has_role(auth.uid(), 'vibe_admin'::public.app_role)
      or exists (
        select 1 from public.vendors v
        where v.id = p.vendor_id and v.user_id = auth.uid()
      )
    );
$$;

REVOKE ALL ON FUNCTION public.vendor_po_sheet_info(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vendor_po_sheet_info(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.vendor_po_sheet_info(uuid[]) TO authenticated;

-- Signature changes (new params) — drop the old overload first.
DROP FUNCTION IF EXISTS public.vendor_update_po_details(uuid, text, text, text, text, text, text);

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
  p_ship_to_zip text default null
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
    vendor_committed_ship_date = coalesce(v_synced_date, vendor_committed_ship_date),
    updated_at = now()
  where id = p_po_id;

  return json_build_object('success', true);
end;
$$;

grant execute on function public.vendor_update_po_details(uuid, text, text, text, text, text, text, text, text, text, text, text, text) to authenticated;
