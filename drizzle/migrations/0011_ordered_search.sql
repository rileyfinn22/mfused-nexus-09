create or replace function public.global_search(q text, per_kind int default 8)
returns table(kind text, id uuid, title text, subtitle text, status text, amount numeric, doc_date timestamptz, link_id uuid)
language plpgsql stable security definer set search_path = public as $$
declare toks text[]; pat text;
begin
  if not (public.has_role(auth.uid(),'vibe_admin') or public.has_role(auth.uid(),'admin')) then return; end if;
  select array_agg(t) into toks from (
    select regexp_replace(lower(w), '[$,]', '', 'g') t from regexp_split_to_table(coalesce(q,''), '\s+') w
  ) s where t <> '' and t <> '#';
  if toks is null then return; end if;
  -- Ordered, word-start match: first word must match a word start, then the next word after it, and so on.
  select string_agg('(^|[^a-z0-9])'||regexp_replace(t,'([.*+?^${}()|\[\]\\])','\\\1','g'), '.*' order by n)
    into pat from unnest(toks) with ordinality u(t,n);

  return query
  select 'invoice', i.id, 'Invoice #'||i.invoice_number, coalesce(c.name,'')||coalesce(' · PO '||i.customer_po_number,''),
         i.status, i.total, i.invoice_date, i.id
  from invoices i left join companies c on c.id=i.company_id
  where i.deleted_at is null and lower(concat_ws(' ', i.invoice_number, i.customer_po_number, c.name, i.status, i.total::text, round(i.total,2)::text,
      to_char(i.invoice_date,'MM/DD/YYYY YYYY-MM-DD Mon FMDD FMMM/FMDD/YYYY'))) ~ pat
  order by i.invoice_date desc nulls last limit per_kind;

  return query
  select 'order', o.id, 'Order #'||o.order_number, coalesce(c.name, o.customer_name,'')||coalesce(' · PO '||o.po_number,''),
         o.status, o.total, o.order_date, o.id
  from orders o left join companies c on c.id=o.company_id
  where o.deleted_at is null and lower(concat_ws(' ', o.order_number, o.po_number, o.customer_name, c.name, o.status, o.description, o.tracking_number,
      o.total::text, round(o.total,2)::text, to_char(o.order_date,'MM/DD/YYYY YYYY-MM-DD Mon FMDD FMMM/FMDD/YYYY'),
      (select string_agg(concat_ws(' ', oi.name, oi.sku), ' ') from order_items oi where oi.order_id=o.id))) ~ pat
  order by o.order_date desc nulls last limit per_kind;

  return query
  select 'customer', c.id, c.name, coalesce(c.email,''), null::text, null::numeric, null::timestamptz, c.id
  from companies c where lower(concat_ws(' ', c.name, c.email, c.billing_email, c.billing_name, c.shipping_name)) ~ pat
  order by c.name limit per_kind;

  return query
  select 'product', p.id, p.name, coalesce(p.item_id,'')||coalesce(' · '||c.name,''), null::text, p.price, null::timestamptz, p.id
  from products p left join companies c on c.id=p.company_id
  where lower(concat_ws(' ', p.name, p.item_id, p.description, c.name)) ~ pat
  order by p.name limit per_kind;

  return query
  select 'vendor_po', v.id, 'PO #'||v.po_number, coalesce(vd.name,'')||coalesce(' · '||v.description,''),
         coalesce(v.production_status, v.status), v.total, v.order_date, v.id
  from vendor_pos v left join vendors vd on vd.id=v.vendor_id
  where lower(concat_ws(' ', v.po_number, vd.name, v.description, v.status, v.tracking_number, v.vendor_invoice_number,
      v.total::text, round(v.total,2)::text, to_char(v.order_date,'MM/DD/YYYY YYYY-MM-DD Mon FMDD'))) ~ pat
  order by v.order_date desc nulls last limit per_kind;

  return query
  select 'quote', qu.id, 'Quote #'||qu.quote_number, coalesce(c.name, qu.customer_name,''), qu.status, qu.total, qu.created_at, qu.id
  from quotes qu left join companies c on c.id=qu.company_id
  where lower(concat_ws(' ', qu.quote_number, qu.customer_name, c.name, qu.description, qu.status, qu.total::text)) ~ pat
  order by qu.created_at desc nulls last limit per_kind;

  return query
  select 'payment', pm.id, 'Payment $'||to_char(pm.amount,'FM999,999,990.00'), 'Invoice #'||i.invoice_number||coalesce(' · Ref '||pm.reference_number,''),
         pm.payment_method, pm.amount, pm.payment_date, pm.invoice_id
  from payments pm join invoices i on i.id=pm.invoice_id
  where lower(concat_ws(' ', pm.amount::text, round(pm.amount,2)::text, pm.reference_number, pm.payment_method, i.invoice_number,
      to_char(pm.payment_date,'MM/DD/YYYY YYYY-MM-DD Mon FMDD'))) ~ pat
  order by pm.payment_date desc nulls last limit per_kind;
end $$;
revoke execute on function public.global_search(text,int) from public, anon;
grant execute on function public.global_search(text,int) to authenticated;