-- Company on the vendor sheet = the company the connected order belongs to
-- (falls back to the PO's customer_company_id when there's no linked order).

DROP FUNCTION IF EXISTS public.vendor_po_sheet_info(uuid[]);

CREATE OR REPLACE FUNCTION public.vendor_po_sheet_info(p_po_ids uuid[])
RETURNS TABLE (po_id uuid, cpo text, order_number text, order_description text, company_name text, invoice_numbers text[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  select
    p.id,
    o.po_number,
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
$$;

REVOKE ALL ON FUNCTION public.vendor_po_sheet_info(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vendor_po_sheet_info(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.vendor_po_sheet_info(uuid[]) TO authenticated;
