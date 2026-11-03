-- Customer art + product flow: flag customer-created products, track proof notifications,
-- and add a safe staff-only SKU re-key that keeps artwork attached.

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS created_by text;
COMMENT ON COLUMN public.products.created_by IS 'Who created the product: "customer" via the portal, NULL = staff/legacy.';

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS proof_notified_at timestamptz;
COMMENT ON COLUMN public.products.proof_notified_at IS 'Last time staff sent the customer a "proofs to review" email for this product.';

-- Mark products created through the customer portal RPC.
CREATE OR REPLACE FUNCTION public.create_customer_product(p_company_id uuid, p_name text, p_brand_id uuid, p_product_type text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_template_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  if p_template_id is not null then
    select t.* into v_template
      from public.product_templates t
     where t.id = p_template_id and t.company_id = p_company_id;
    if v_template.id is null then
      raise exception 'folder does not belong to this company';
    end if;
    if v_template.brand_id is not null and v_template.brand_id <> p_brand_id then
      raise exception 'folder belongs to a different brand';
    end if;
    if lower(v_name) not like lower(v_template.name) || '%' then
      v_name := v_template.name || ' - ' || v_name;
    end if;
    if v_type is null then
      v_type := lower(v_template.product_type);
    end if;
    if v_type is null then
      select lower(p.product_type) into v_type
        from public.products p
       where p.template_id = v_template.id and p.product_type is not null
       group by lower(p.product_type)
       order by count(*) desc
       limit 1;
    end if;
  else
    select t.* into v_template
      from public.product_templates t
     where t.company_id = p_company_id
       and t.brand_id = p_brand_id
       and (
         lower(t.product_type) is not distinct from v_type
         or (t.product_type is null and exists (
           select 1 from public.products p
            where p.template_id = t.id
              and lower(coalesce(p.product_type, '')) is not distinct from coalesce(v_type, '')
         ))
       )
     order by (select count(*) from public.products p where p.template_id = t.id) desc, t.name
     limit 1;
  end if;

  loop
    v_item_id := 'VB-' || lpad((floor(random() * 90000) + 10000)::int::text, 5, '0');
    exit when not exists (select 1 from public.products where item_id = v_item_id);
    v_tries := v_tries + 1;
    if v_tries > 25 then
      raise exception 'could not allocate an item id';
    end if;
  end loop;

  insert into public.products (
    company_id, name, description, item_id, brand_id, product_type, template_id, state, created_by
  ) values (
    p_company_id,
    v_name,
    nullif(btrim(coalesce(p_description, '')), ''),
    v_item_id,
    p_brand_id,
    v_type,
    v_template.id,
    v_template.state,
    case when public.has_role(v_uid, 'vibe_admin'::app_role) then null else 'customer' end
  )
  returning id into v_id;

  return v_id;
end;
$function$;

-- Staff-only SKU change that re-keys the product's artwork (customer art, vibe proofs and
-- rejected archive) in one transaction, scoped to the product's company so another
-- company's files with the same SKU are never touched. Refuses a SKU already in use.
CREATE OR REPLACE FUNCTION public.rekey_product_sku(p_product_id uuid, p_new_sku text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
declare
  v_product public.products%rowtype;
  v_new text := nullif(btrim(coalesce(p_new_sku, '')), '');
begin
  if not public.has_role(auth.uid(), 'vibe_admin'::app_role) then
    raise exception 'not allowed';
  end if;

  select * into v_product from public.products where id = p_product_id for update;
  if v_product.id is null then
    raise exception 'product not found';
  end if;

  if v_new is null then
    raise exception 'SKU is required';
  end if;

  if v_new = v_product.item_id then
    return;
  end if;

  if exists (
    select 1 from public.products
    where company_id = v_product.company_id and item_id = v_new and id <> p_product_id
  ) then
    raise exception 'SKU % is already used by another product for this company', v_new;
  end if;

  update public.products set item_id = v_new where id = p_product_id;

  if v_product.item_id is not null then
    update public.artwork_files
       set sku = v_new
     where sku = v_product.item_id and company_id = v_product.company_id;
    update public.rejected_artwork_files
       set sku = v_new
     where sku = v_product.item_id and company_id = v_product.company_id;
  end if;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.rekey_product_sku(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rekey_product_sku(uuid, text) TO service_role;