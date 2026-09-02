-- Mark orders a customer submitted themselves, so they can be held in a pending
-- queue for VibePKG to approve rather than dropping straight into the pipeline.
--
-- Approval reuses the existing vibe_approved / vibe_approved_by / vibe_approved_at
-- columns, the same way pull & ship orders already work.

alter table public.orders
  add column if not exists submitted_by_customer boolean not null default false;

comment on column public.orders.submitted_by_customer is
  'True when the buying company placed this order themselves via submit_customer_order(). '
  'Pairs with vibe_approved: submitted_by_customer AND NOT vibe_approved = awaiting review.';

create index if not exists orders_awaiting_customer_approval_idx
  on public.orders (company_id)
  where submitted_by_customer and not vibe_approved;

-- Backfill: nothing to do. Every pre-existing order was created by staff
-- (all 232 have created_by NULL), so the false default is already correct.

-- submit_customer_order now stamps the flag. Body is otherwise unchanged from
-- 20260901160000 apart from the one added column.
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

  if coalesce(btrim(p_shipping_name), '')     = ''
     or coalesce(btrim(p_shipping_street), '') = ''
     or coalesce(btrim(p_shipping_city), '')   = ''
     or coalesce(btrim(p_shipping_state), '')  = ''
     or coalesce(btrim(p_shipping_zip), '')    = '' then
    raise exception 'A complete shipping address is required' using errcode = '22023';
  end if;

  insert into public.orders (
    order_number, company_id, created_by, status, order_type,
    submitted_by_customer, vibe_approved,
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
    true,   -- submitted_by_customer
    false,  -- awaits VibePKG approval
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
