-- Vendor-uploaded shipment documents (packing lists, proofs, shipped qty
-- sheets, final invoices) are for vibe admin only; customers get the packing
-- lists WE issue via invoice_packing_lists on the invoice page. Customer
-- production detail now returns progress updates only.
-- Applied live via claude-admin.

CREATE OR REPLACE FUNCTION public.customer_po_production_detail(p_po_id uuid)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    when not exists (
      select 1 from public.vendor_pos p
      join public.orders o on o.id = p.order_id
      where p.id = p_po_id
        and public.user_has_company_access(auth.uid(), o.company_id)
    )
    then json_build_object('success', false, 'error', 'Not authorized')
    else (
      select json_build_object(
        'success', true,
        'production_percent', p.production_percent,
        'updates', coalesce(
          (select json_agg(json_build_object(
              'id', u.id,
              'kind', u.kind,
              'note', u.note,
              'attachment_name', u.attachment_name,
              'attachment_url', u.attachment_url,
              'percent_at_time', u.percent_at_time,
              'created_at', u.created_at
            ) order by u.created_at desc)
           from public.vendor_po_production_updates u
           where u.vendor_po_id = p.id
             and u.kind = 'update'),
          '[]'::json
        )
      )
      from public.vendor_pos p where p.id = p_po_id
    )
  end;
$function$;
