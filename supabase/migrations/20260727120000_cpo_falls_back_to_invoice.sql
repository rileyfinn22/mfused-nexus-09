-- The customer PO often gets recorded on the invoice (customer_po_number)
-- instead of the order. Sheets read orders.po_number, so those CPOs showed
-- blank (e.g. orders 10980/11008). Fall back to the invoice's CPO whenever
-- the order's po_number is empty. Applied live via claude-admin.

CREATE OR REPLACE FUNCTION public.customer_production_sheet(p_company_id uuid)
 RETURNS TABLE(po_id uuid, cpo text, order_number text, description text, completion_date text, delivery_date text, notes text, tracking_carrier text, tracking_number text, tracking_url text, ship_to_name text, ship_to_street text, ship_to_city text, ship_to_state text, ship_to_zip text, sheet_completed_at timestamp with time zone, production_percent integer, invoice_numbers text[], order_date timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    p.id,
    coalesce(
      nullif(btrim(o.po_number), ''),
      (select max(i.customer_po_number)
       from public.invoices i
       where i.order_id = o.id
         and i.deleted_at is null
         and nullif(btrim(i.customer_po_number), '') is not null)
    ),
    o.order_number,
    coalesce(p.sheet_description, o.description),
    p.completion_date,
    p.delivery_date,
    p.notes,
    p.tracking_carrier,
    p.tracking_number,
    p.tracking_url,
    p.ship_to_name,
    p.ship_to_street,
    p.ship_to_city,
    p.ship_to_state,
    p.ship_to_zip,
    p.sheet_completed_at,
    p.production_percent,
    coalesce(
      (select array_agg(distinct i.invoice_number)
       from public.invoices i
       where i.order_id = o.id
         and i.deleted_at is null
         and i.invoice_number is not null),
      '{}'::text[]
    ),
    p.order_date
  from public.vendor_pos p
  join public.orders o on o.id = p.order_id
  where p.po_type <> 'expense'
    and o.company_id = p_company_id
    and public.user_has_company_access(auth.uid(), p_company_id);
$function$;

CREATE OR REPLACE FUNCTION public.vendor_po_sheet_info(p_po_ids uuid[])
 RETURNS TABLE(po_id uuid, cpo text, order_number text, order_description text, company_name text, invoice_numbers text[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    p.id,
    coalesce(
      nullif(btrim(o.po_number), ''),
      (select max(i.customer_po_number)
       from public.invoices i
       where i.order_id = o.id
         and i.deleted_at is null
         and nullif(btrim(i.customer_po_number), '') is not null)
    ),
    o.order_number,
    o.description,
    c.name,
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
  left join public.companies c on c.id = coalesce(o.company_id, p.customer_company_id)
  where p.id = any(p_po_ids)
    and (
      public.has_role(auth.uid(), 'vibe_admin'::public.app_role)
      or exists (
        select 1 from public.vendors v
        where v.id = p.vendor_id and v.user_id = auth.uid()
      )
    );
$function$;
