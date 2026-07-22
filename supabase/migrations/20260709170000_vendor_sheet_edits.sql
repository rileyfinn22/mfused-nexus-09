-- Spreadsheet-style vendor editing: let vendors fill in tracking, notes, and
-- final quantities on their own POs (same ownership check as
-- vendor_update_po_status). Empty string clears a field; null leaves it as-is.

create or replace function public.vendor_update_po_details(
  p_po_id uuid,
  p_tracking_carrier text default null,
  p_tracking_number text default null,
  p_tracking_url text default null,
  p_notes text default null
)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- Caller must own this PO (vendor linked via vendors.user_id).
  perform 1
  from public.vendor_pos p
  join public.vendors v on v.id = p.vendor_id
  where p.id = p_po_id and v.user_id = auth.uid();

  if not found then
    return json_build_object('success', false, 'error', 'Not authorized for this PO');
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
    updated_at = now()
  where id = p_po_id;

  return json_build_object('success', true);
end;
$$;

grant execute on function public.vendor_update_po_details(uuid, text, text, text, text) to authenticated;

create or replace function public.vendor_update_item_final_qty(
  p_item_id uuid,
  p_final_quantity integer
)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if p_final_quantity is not null and p_final_quantity < 0 then
    return json_build_object('success', false, 'error', 'Final quantity cannot be negative');
  end if;

  -- Caller must own the PO this item belongs to.
  perform 1
  from public.vendor_po_items i
  join public.vendor_pos p on p.id = i.vendor_po_id
  join public.vendors v on v.id = p.vendor_id
  where i.id = p_item_id and v.user_id = auth.uid();

  if not found then
    return json_build_object('success', false, 'error', 'Not authorized for this item');
  end if;

  update public.vendor_po_items
  set final_quantity = p_final_quantity
  where id = p_item_id;

  return json_build_object('success', true);
end;
$$;

grant execute on function public.vendor_update_item_final_qty(uuid, integer) to authenticated;
