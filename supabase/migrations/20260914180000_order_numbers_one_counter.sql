-- Two order-number counters had drifted apart, and the customer one was about to collide.
--
-- Customer orders take their number from order_number_seq (20260901160000). Staff orders still
-- take max(order_number)+1 client-side in CreateOrder and never touch the sequence. Since the
-- sequence was seeded on 1 Sep staff have placed 11080..11090 that way, while the sequence sat
-- at 11079. The next customer submission would have been numbered 11080 and failed on
-- orders_order_number_key -- the customer sees "duplicate key" and no order.
--
-- One counter now. next_order_number() hands out max(sequence, highest existing)+1 and moves
-- the sequence past it, and a BEFORE INSERT trigger on orders (a) fills order_number from it
-- when the row arrives without one and (b) advances the sequence whenever a client inserts a
-- higher number itself, so the staff path can keep computing its own number for now without
-- ever leaving the sequence behind.
--
-- Also: nobody was told when a customer placed an order. The Orders page has an "Awaiting
-- approval" section, but only if someone happens to open it. submit_customer_order now drops a
-- notification for every vibe_admin, which the bell in the header already reads.

CREATE OR REPLACE FUNCTION public.next_order_number()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path TO 'public'
AS $function$
DECLARE
  v_max  bigint;
  v_next bigint;
BEGIN
  SELECT COALESCE(MAX((regexp_match(order_number, '(\d+)$'))[1]::bigint), 0)
    INTO v_max
    FROM public.orders;

  v_next := GREATEST(nextval('public.order_number_seq'), v_max + 1);
  PERFORM setval('public.order_number_seq', v_next, true);
  RETURN v_next::text;
END;
$function$;

CREATE OR REPLACE FUNCTION public.orders_keep_number_sequence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_num bigint;
BEGIN
  IF NEW.order_number IS NULL OR btrim(NEW.order_number) = '' THEN
    NEW.order_number := public.next_order_number();
    RETURN NEW;
  END IF;

  -- A client picked its own number: make sure the sequence never falls behind it.
  v_num := (regexp_match(NEW.order_number, '(\d+)$'))[1]::bigint;
  IF v_num IS NOT NULL AND v_num > (SELECT last_value FROM public.order_number_seq) THEN
    PERFORM setval('public.order_number_seq', v_num, true);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_orders_keep_number_sequence ON public.orders;
CREATE TRIGGER trg_orders_keep_number_sequence
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.orders_keep_number_sequence();

-- Bring the sequence up to today's highest order number right now.
SELECT setval(
  'public.order_number_seq',
  GREATEST(
    (SELECT last_value FROM public.order_number_seq),
    COALESCE((SELECT MAX((regexp_match(order_number, '(\d+)$'))[1]::bigint) FROM public.orders), 0)
  ),
  true
);

-- submit_customer_order: number from next_order_number(), plus a notification to every
-- vibe_admin. Body otherwise unchanged from 20260902050000.
CREATE OR REPLACE FUNCTION public.submit_customer_order(
  p_company_id      uuid,
  p_items           jsonb,
  p_shipping_name   text,
  p_shipping_street text,
  p_shipping_city   text,
  p_shipping_state  text,
  p_shipping_zip    text,
  p_po_number       text        DEFAULT NULL,
  p_customer_name   text        DEFAULT NULL,
  p_customer_email  text        DEFAULT NULL,
  p_customer_phone  text        DEFAULT NULL,
  p_due_date        timestamptz DEFAULT NULL,
  p_billing_name    text        DEFAULT NULL,
  p_billing_street  text        DEFAULT NULL,
  p_billing_city    text        DEFAULT NULL,
  p_billing_state   text        DEFAULT NULL,
  p_billing_zip     text        DEFAULT NULL,
  p_memo            text        DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_uid      uuid := auth.uid();
  v_order_id uuid;
  v_order_no text;
  v_company  text;
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

  select name into v_company from public.companies where id = p_company_id;
  v_order_no := public.next_order_number();

  insert into public.orders (
    order_number, company_id, created_by, status, order_type,
    submitted_by_customer, vibe_approved,
    po_number, customer_name, customer_email, customer_phone, due_date,
    shipping_name, shipping_street, shipping_city, shipping_state, shipping_zip,
    billing_name, billing_street, billing_city, billing_state, billing_zip,
    memo
  ) values (
    v_order_no,
    p_company_id,
    v_uid,
    'pending',
    'standard',
    true,   -- submitted_by_customer
    false,  -- awaits VibePKG approval
    nullif(btrim(coalesce(p_po_number, '')), ''),
    coalesce(nullif(btrim(coalesce(p_customer_name, '')), ''), v_company),
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

  -- Tell VibePKG. One notification per vibe_admin; the header bell reads this table.
  insert into public.notifications (user_id, company_id, type, title, message, link, read)
  select ur.user_id,
         p_company_id,
         'customer_order',
         'New customer order ' || v_order_no,
         coalesce(v_company, 'A customer') || ' placed order ' || v_order_no || ' and it is awaiting approval.',
         '/orders/' || v_order_id::text,
         false
    from public.user_roles ur
   where ur.role = 'vibe_admin';

  return v_order_id;
end;
$function$;
