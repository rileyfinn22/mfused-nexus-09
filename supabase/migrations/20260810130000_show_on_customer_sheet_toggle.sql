-- Per-PO control over what appears in the customer's production tracking.
--
-- Deliberately NULLABLE with no default. NULL means "use the type rule" -- a production PO
-- (the ones raised when a vendor is assigned) shows, a custom or expense PO does not. Setting
-- the flag overrides that either way.
--
-- Doing it this way means no backfill, and a PO created tomorrow gets the right behaviour
-- without anyone remembering to set it: assign a vendor, it tracks; raise a custom PO, it stays
-- internal until someone deliberately turns it on.

ALTER TABLE public.vendor_pos
  ADD COLUMN IF NOT EXISTS show_on_customer_sheet boolean;

COMMENT ON COLUMN public.vendor_pos.show_on_customer_sheet IS
  'Whether this PO appears in the customer production sheet. NULL = follow po_type (production shows, custom/expense do not).';

CREATE OR REPLACE FUNCTION public.vendor_po_visible_to_customer(_show boolean, _po_type text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT COALESCE(_show, COALESCE(_po_type, 'production') = 'production')
$function$;

CREATE OR REPLACE FUNCTION public.customer_production_sheet(p_company_id uuid)
 RETURNS TABLE(po_id uuid, cpo text, order_number text, description text, completion_date text, delivery_date text, notes text, tracking_carrier text, tracking_number text, tracking_url text, ship_to_name text, ship_to_street text, ship_to_city text, ship_to_state text, ship_to_zip text, sheet_completed_at timestamp with time zone, production_percent integer, invoice_numbers text[], invoice_ids uuid[], order_date timestamp with time zone)
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
      (select array_agg(i.invoice_number order by i.invoice_number, i.id)
       from public.invoices i
       where i.order_id = o.id
         and i.deleted_at is null
         and i.invoice_number is not null),
      '{}'::text[]
    ),
    coalesce(
      (select array_agg(i.id order by i.invoice_number, i.id)
       from public.invoices i
       where i.order_id = o.id
         and i.deleted_at is null
         and i.invoice_number is not null),
      '{}'::uuid[]
    ),
    p.order_date
  from public.vendor_pos p
  join public.orders o on o.id = p.order_id
  where public.vendor_po_visible_to_customer(p.show_on_customer_sheet, p.po_type)
    and o.company_id = p_company_id
    and public.user_has_company_access(auth.uid(), p_company_id);
$function$;

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
        and public.vendor_po_visible_to_customer(p.show_on_customer_sheet, p.po_type)
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
             and u.kind = 'update'
             and u.published_at is not null),
          '[]'::json
        )
      )
      from public.vendor_pos p where p.id = p_po_id
    )
  end;
$function$;
