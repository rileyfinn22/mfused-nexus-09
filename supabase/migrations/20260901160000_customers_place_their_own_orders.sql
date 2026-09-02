-- Buyers (the `company` and `customer` roles — both are clients) place their own
-- orders for their own products. Orders land as 'pending' for vibe_admin review.
--
-- Buyers deliberately get NO direct INSERT grant on orders/order_items. Everything
-- runs through submit_customer_order(), a SECURITY DEFINER RPC that:
--   * takes the order number from a sequence — a buyer can only SELECT their own
--     company's orders, so a client-side max(order_number)+1 collides with
--     orders_order_number_key
--   * stamps company_id / created_by / status server-side rather than trusting the client
--   * rejects any product that does not belong to the buyer's own company
--   * writes only buyer-supplied columns, never vendor_id / vendor_cost / vendor_po_number

-- 1. Order numbers come from a sequence instead of a client-side max().
create sequence if not exists public.order_number_seq as bigint start with 11075;

select setval(
  'public.order_number_seq',
  greatest(
    coalesce(
      (select max((regexp_match(order_number, '(\d+)$'))[1]::bigint) from public.orders),
      11074
    ),
    11074
  ),
  true
);

-- 2. The one way a buyer can create an order.
create or replace function public.submit_customer_order(
  p_company_id      uuid,
  p_items           jsonb,
  p_shipping_name   text,
  p_shipping_street text,
  p_shipping_city   text,
  p_shipping_state  text,
  p_shipping_zip    text,
  p_po_number       text        default null,
  p_customer_name   text        default null,
  p_customer_email  text        default null,
  p_customer_phone  text        default null,
  p_due_date        timestamptz default null,
  p_billing_name    text        default null,
  p_billing_street  text        default null,
  p_billing_city    text        default null,
  p_billing_state   text        default null,
  p_billing_zip     text        default null,
  p_memo            text        default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_uid      uuid := auth.uid();
  v_order_id uuid;
  v_item     jsonb;
  v_product  public.products%rowtype;
  v_qty      integer;
  v_price    numeric;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  -- The caller must hold a buyer seat in the company they are ordering for.
  -- Checked against user_roles directly (not get_user_company, which is
  -- `LIMIT 1` with no ORDER BY and picks arbitrarily for multi-company users).
  if not exists (
    select 1
    from public.user_roles ur
    where ur.user_id = v_uid
      and ur.company_id = p_company_id
      and ur.role in ('company', 'customer', 'admin')
  ) and not public.has_role(v_uid, 'vibe_admin') then
    raise exception 'You do not have access to place orders for this company'
      using errcode = '42501';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'An order needs at least one line item' using errcode = '22023';
  end if;

  -- orders.shipping_* are NOT NULL.
  if coalesce(btrim(p_shipping_name), '')   = ''
     or coalesce(btrim(p_shipping_street), '') = ''
     or coalesce(btrim(p_shipping_city), '')   = ''
     or coalesce(btrim(p_shipping_state), '')  = ''
     or coalesce(btrim(p_shipping_zip), '')    = '' then
    raise exception 'A complete shipping address is required' using errcode = '22023';
  end if;

  insert into public.orders (
    order_number, company_id, created_by, status, order_type,
    po_number, customer_name, customer_email, customer_phone, due_date,
    shipping_name, shipping_street, shipping_city, shipping_state, shipping_zip,
    billing_name, billing_street, billing_city, billing_state, billing_zip,
    memo
  ) values (
    nextval('public.order_number_seq')::text,
    p_company_id,
    v_uid,
    'pending',
    'standard',
    nullif(btrim(coalesce(p_po_number, '')), ''),
    coalesce(
      nullif(btrim(coalesce(p_customer_name, '')), ''),
      (select name from public.companies where id = p_company_id)
    ),
    nullif(btrim(coalesce(p_customer_email, '')), ''),
    nullif(btrim(coalesce(p_customer_phone, '')), ''),
    p_due_date,
    btrim(p_shipping_name),
    btrim(p_shipping_street),
    btrim(p_shipping_city),
    btrim(p_shipping_state),
    btrim(p_shipping_zip),
    nullif(btrim(coalesce(p_billing_name, '')), ''),
    nullif(btrim(coalesce(p_billing_street, '')), ''),
    nullif(btrim(coalesce(p_billing_city, '')), ''),
    nullif(btrim(coalesce(p_billing_state, '')), ''),
    nullif(btrim(coalesce(p_billing_zip, '')), ''),
    nullif(btrim(coalesce(p_memo, '')), '')
  )
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    -- A buyer may only order products their own company owns. This is the check
    -- that makes the product_id in the payload untrusted-safe.
    select * into v_product
    from public.products
    where id = (v_item->>'product_id')::uuid
      and company_id = p_company_id;

    if not found then
      raise exception 'That product is not available to this company'
        using errcode = '42501';
    end if;

    v_qty   := coalesce((v_item->>'quantity')::integer, 0);
    v_price := coalesce((v_item->>'unit_price')::numeric, 0);

    if v_qty <= 0 then
      raise exception 'Quantity for % must be greater than zero', v_product.name
        using errcode = '22023';
    end if;

    if v_price < 0 then
      raise exception 'Price for % cannot be negative', v_product.name
        using errcode = '22023';
    end if;

    -- vendor_id / vendor_cost / vendor_po_number are never written here; those
    -- stay vibe_admin/finance-only and get filled in during review.
    insert into public.order_items (
      order_id, product_id, sku, item_id, name, description, quantity, unit_price, total
    ) values (
      v_order_id,
      v_product.id,
      coalesce(v_product.item_id, 'SKU-' || left(v_product.id::text, 8)),
      v_product.item_id,
      coalesce(v_product.name, '(unnamed product)'),
      v_product.description,
      v_qty,
      v_price,
      v_qty * v_price
    );
  end loop;

  return v_order_id;
end;
$$;

revoke all on function public.submit_customer_order(
  uuid, jsonb, text, text, text, text, text, text, text, text, text,
  timestamptz, text, text, text, text, text, text
) from public, anon;

grant execute on function public.submit_customer_order(
  uuid, jsonb, text, text, text, text, text, text, text, text, text,
  timestamptz, text, text, text, text, text, text
) to authenticated;

comment on function public.submit_customer_order(
  uuid, jsonb, text, text, text, text, text, text, text, text, text,
  timestamptz, text, text, text, text, text, text
) is
  'Buyer-facing order submission. Validates the caller''s seat in the company and '
  'that every product belongs to that company, then creates a pending order for '
  'vibe_admin review. Never writes vendor or cost columns.';
