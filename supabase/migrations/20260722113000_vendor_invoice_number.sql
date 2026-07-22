-- Vendor invoice column on the vendor sheet: the vendor's own invoice number
-- for a PO, free-text, editable by the owning vendor or a vibe admin.

ALTER TABLE public.vendor_pos ADD COLUMN IF NOT EXISTS vendor_invoice_number text;

-- Signature changes (new param) — drop the old overload first.
DROP FUNCTION IF EXISTS public.vendor_update_po_details(uuid, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.vendor_update_po_details(
  p_po_id uuid,
  p_tracking_carrier text default null,
  p_tracking_number text default null,
  p_tracking_url text default null,
  p_notes text default null,
  p_completion_date text default null,
  p_vendor_invoice_number text default null
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
    vendor_invoice_number = case when p_vendor_invoice_number is null then vendor_invoice_number
                                 when trim(p_vendor_invoice_number) = '' then null
                                 else p_vendor_invoice_number end,
    vendor_committed_ship_date = coalesce(v_synced_date, vendor_committed_ship_date),
    updated_at = now()
  where id = p_po_id;

  return json_build_object('success', true);
end;
$$;

grant execute on function public.vendor_update_po_details(uuid, text, text, text, text, text, text) to authenticated;
