-- One order often splits into multiple vendor POs; each shows as its own row
-- on the customer sheet (same invoice + CPO). When no per-PO sheet_description
-- is set, both rows used to fall back to the shared order description and were
-- indistinguishable. Prefer the PO's own description before the order's.
-- (Checked live data: no vendor names appear in vendor_pos.description.)
-- Applied live via claude-admin.

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
    coalesce(
      nullif(btrim(p.sheet_description), ''),
      nullif(btrim(p.description), ''),
      o.description
    ),
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
