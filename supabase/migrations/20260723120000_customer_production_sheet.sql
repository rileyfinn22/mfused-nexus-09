-- Customer-facing production sheet (test rollout: Mfused only, gated in the UI).
-- SECURITY DEFINER pipes expose ONLY customer-safe fields: vibe invoice numbers,
-- the customer's own PO number, description, dates, notes, tracking, ship-to,
-- progress. Never vendor identity, vendor invoices, or any cost data.

CREATE OR REPLACE FUNCTION public.customer_production_sheet()
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
    and public.user_has_company_access(auth.uid(), o.company_id);
$$;

REVOKE ALL ON FUNCTION public.customer_production_sheet() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.customer_production_sheet() FROM anon;
GRANT EXECUTE ON FUNCTION public.customer_production_sheet() TO authenticated;

-- Detail: progress + production updates feed (notes, packing lists, proofs only —
-- never final invoices or shipped qty sheets).
CREATE OR REPLACE FUNCTION public.customer_po_production_detail(p_po_id uuid)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
             and u.kind in ('update', 'packing_list', 'proof')),
          '[]'::json
        )
      )
      from public.vendor_pos p where p.id = p_po_id
    )
  end;
$$;

REVOKE ALL ON FUNCTION public.customer_po_production_detail(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.customer_po_production_detail(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.customer_po_production_detail(uuid) TO authenticated;
