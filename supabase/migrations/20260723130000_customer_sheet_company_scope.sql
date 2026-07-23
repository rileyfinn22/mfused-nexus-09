-- Scope the customer production sheet to the caller's ACTIVE company (multi-
-- company users like internal staff were seeing all their companies blended).
-- Access to the requested company is still verified server-side.

DROP FUNCTION IF EXISTS public.customer_production_sheet();

CREATE OR REPLACE FUNCTION public.customer_production_sheet(p_company_id uuid)
RETURNS TABLE (
  po_id uuid,
  cpo text,
  order_number text,
  description text,
  completion_date text,
  delivery_date text,
  notes text,
  tracking_carrier text,
  tracking_number text,
  tracking_url text,
  ship_to_name text,
  ship_to_street text,
  ship_to_city text,
  ship_to_state text,
  ship_to_zip text,
  sheet_completed_at timestamptz,
  production_percent integer,
  invoice_numbers text[],
  order_date timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  select
    p.id,
    o.po_number,
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
$$;

REVOKE ALL ON FUNCTION public.customer_production_sheet(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.customer_production_sheet(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.customer_production_sheet(uuid) TO authenticated;
