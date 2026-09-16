-- Folders (product_templates) get an explicit kind, and buyers can create folders.
--
-- A buyer's catalog is brand -> folder (Boxes / Foils) -> SKUs. Until now a folder's kind was
-- inferred from the products inside it, which fails for a brand-new empty folder. Folders now
-- carry product_type themselves (seeded from their products), and a buyer with a brand-organised
-- catalog can create one through create_customer_template. Products added to a folder take the
-- folder's kind when none is given.

-- 1. Folder kind
alter table public.product_templates
  add column if not exists product_type text;

update public.product_templates t
   set product_type = s.product_type
  from (
    select p.template_id, lower(p.product_type) as product_type,
           row_number() over (partition by p.template_id order by count(*) desc, lower(p.product_type)) as rn
      from public.products p
     where p.template_id is not null and p.product_type is not null
     group by p.template_id, lower(p.product_type)
  ) s
 where s.template_id = t.id and s.rn = 1 and t.product_type is null;

-- 2. Buyers create folders
create or replace function public.create_customer_template(
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
  v_uid   uuid := auth.uid();
  v_name  text := btrim(coalesce(p_name, ''));
  v_type  text := nullif(lower(btrim(coalesce(p_product_type, ''))), '');
  v_state text;
  v_id    uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if v_name = '' then
    raise exception 'folder name is required';
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

  -- Same state the company's other folders use (e.g. "General"), so new SKUs match their siblings.
  select state into v_state
    from public.product_templates
   where company_id = p_company_id and state is not null
   group by state order by count(*) desc limit 1;

  insert into public.product_templates (company_id, name, brand_id, product_type, description, state)
  values (p_company_id, v_name, p_brand_id, v_type, nullif(btrim(coalesce(p_description, '')), ''), v_state)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.create_customer_template(uuid, text, uuid, text, text) from public;
grant execute on function public.create_customer_template(uuid, text, uuid, text, text) to authenticated;

-- 3. create_customer_product: a folder's own kind wins over inference
create or replace function public.create_customer_product(
  p_company_id   uuid,
  p_name         text,
  p_brand_id     uuid,
  p_product_type text default null,
  p_description  text default null,
  p_template_id  uuid default null
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
    -- Folder: same brand and kind (folder's own kind first, then what it holds).
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
