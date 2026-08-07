-- The customer production sheet was handing customers two fields straight off the vendor PO:
--   notes        -- 37 of 77 Mfused POs have something in it ("Shipped", "Hold", "to new
--                   address"). Benign today, but it is our working field on a vendor PO and
--                   nothing stops the next entry being an internal remark.
--   description  -- fell back to p.description, the vendor PO's own description.
--
-- Both are replaced with fields written to be seen: p.sheet_description (added for exactly this
-- purpose) and the order's own description. Notes are dropped entirely -- the column stays in
-- the signature so callers do not break, and always returns null.
--
-- The rest of the sheet was already safe: it returns the CUSTOMER's po_number, never the vendor
-- PO number, and no vendor identity, cost or total is exposed anywhere in it.

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
    -- Customer-facing description only. p.description is the vendor PO's and is not shown.
    coalesce(
      nullif(btrim(p.sheet_description), ''),
      o.description
    ),
    p.completion_date,
    p.delivery_date,
    -- Vendor PO notes are ours, not theirs.
    null::text,
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
  where p.po_type <> 'expense'
    and o.company_id = p_company_id
    and public.user_has_company_access(auth.uid(), p_company_id);
$function$;
