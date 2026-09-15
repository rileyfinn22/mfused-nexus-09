-- Buyers with a brand-organised catalog (Nutrastrips) can add their own products.
--
-- They supply the four things only they know: name, brand, kind (Boxes / Foils / Other, stored
-- as products.product_type) and a description. Everything commercial (price, cost, vendor,
-- specs) stays with vibe_admin and is filled in afterwards, so the row is created with those
-- blank.
--
-- Buyers get no INSERT grant on products; the existing "Users can create company products"
-- policy keys off get_user_company(), which is unreliable for multi-company users. This
-- SECURITY DEFINER RPC checks company access and brand ownership itself, mints a unique VB-
-- item id the same way the admin dialogs do, and files the product into the matching folder:
-- the template of the same brand that already holds products of the same kind (so a new
-- Curapeptix foil lands in "CURAPEPTIX FOILS"). If no such folder exists the product is left
-- loose; it still shows on the Products page under its brand.

create or replace function public.create_customer_product(
  p_company_id   uuid,
  p_name         text,
  p_brand_id     uuid,
  p_product_type text default null,
  p_description  text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_uid       uuid := auth.uid();
  v_name      text := btrim(coalesce(p_name, ''));
  v_type      text := nullif(lower(btrim(coalesce(p_product_type, ''))), '');
  v_template  public.product_templates%rowtype;
  v_item_id   text;
  v_tries     integer := 0;
  v_id        uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if v_name = '' then
    raise exception 'product name is required';
  end if;
  if p_brand_id is null then
    raise exception 'brand is required';
  end if;

  if not (public.has_role(v_uid, 'vibe_admin'::app_role)
          or public.user_has_company_access(v_uid, p_company_id)) then
    raise exception 'not allowed';
  end if;

  if not exists (
    select 1 from public.product_brands where id = p_brand_id and company_id = p_company_id
  ) then
    raise exception 'brand does not belong to this company';
  end if;

  -- Folder: same brand, already holding products of this kind.
  select t.* into v_template
    from public.product_templates t
   where t.company_id = p_company_id
     and t.brand_id = p_brand_id
     and exists (
       select 1 from public.products p
        where p.template_id = t.id
          and lower(coalesce(p.product_type, '')) is not distinct from coalesce(v_type, '')
     )
   order by (select count(*) from public.products p where p.template_id = t.id) desc, t.name
   limit 1;

  -- Unique VB-##### item id, like the admin dialogs generate.
  loop
    v_item_id := 'VB-' || lpad((floor(random() * 90000) + 10000)::int::text, 5, '0');
    exit when not exists (select 1 from public.products where item_id = v_item_id);
    v_tries := v_tries + 1;
    if v_tries > 25 then
      raise exception 'could not allocate an item id';
    end if;
  end loop;

  insert into public.products (
    company_id, name, description, item_id, brand_id, product_type, template_id, state
  ) values (
    p_company_id,
    v_name,
    nullif(btrim(coalesce(p_description, '')), ''),
    v_item_id,
    p_brand_id,
    v_type,
    v_template.id,
    v_template.state
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.create_customer_product(uuid, text, uuid, text, text) from public;
grant execute on function public.create_customer_product(uuid, text, uuid, text, text) to authenticated;
