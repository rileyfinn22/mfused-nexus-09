-- Customers never see vendor notes or attachments — the production detail
-- exposes only the progress percent. Applied live via claude-admin.

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
        'production_percent', p.production_percent
      )
      from public.vendor_pos p where p.id = p_po_id
    )
  end;
$function$;
