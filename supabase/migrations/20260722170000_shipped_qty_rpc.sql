-- Line-items sheet on the vendor PO detail page: vendors report shipped
-- quantity per SKU (total column = shipped x price/pc). Owning vendor or
-- vibe admin may update.

create or replace function public.vendor_update_item_shipped_qty(
  p_item_id uuid,
  p_shipped_quantity integer
)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if p_shipped_quantity is not null and p_shipped_quantity < 0 then
    return json_build_object('success', false, 'error', 'Shipped quantity cannot be negative');
  end if;

  perform 1
  from public.vendor_po_items i
  join public.vendor_pos p on p.id = i.vendor_po_id
  join public.vendors v on v.id = p.vendor_id
  where i.id = p_item_id and v.user_id = auth.uid();

  if not found and not public.has_role(auth.uid(), 'vibe_admin'::public.app_role) then
    return json_build_object('success', false, 'error', 'Not authorized for this item');
  end if;

  update public.vendor_po_items
  set shipped_quantity = p_shipped_quantity
  where id = p_item_id;

  return json_build_object('success', true);
end;
$$;

grant execute on function public.vendor_update_item_shipped_qty(uuid, integer) to authenticated;
