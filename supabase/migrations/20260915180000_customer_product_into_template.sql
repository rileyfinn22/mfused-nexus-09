-- create_customer_product can now be told which folder (template) the product goes in.
--
-- The Products page gets a "+" on each folder and a Quick Add inside it for buyers, so a new
-- Dissolvd box is added from inside "Dissolvd Box" and lands there with no guessing, named
-- "Dissolvd Box - <name>" like the admin Quick Add does. Without p_template_id the function
-- keeps its previous behaviour: pick the same-brand folder that already holds that kind.

drop function if exists public.create_customer_product(uuid, text, uuid, text, text);

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
    -- Explicit folder: must be this company's. Its brand wins if it has one.
    select t.* into v_template
      from public.product_templates t
     where t.id = p_template_id and t.company_id = p_company_id;
    if v_template.id is null then
      raise exception 'folder does not belong to this company';
    end if;
    if v_template.brand_id is not null and v_template.brand_id <> p_brand_id then
      raise exception 'folder belongs to a different brand';
    end if;
    -- Same naming as the admin Quick Add: "<folder> - <name>", unless already prefixed.
    if lower(v_name) not like lower(v_template.name) || '%' then
      v_name := v_template.name || ' - ' || v_name;
    end if;
    -- No kind given: take the kind the folder's products already have.
    if v_type is null then
      select lower(p.product_type) into v_type
        from public.products p
       where p.template_id = v_template.id and p.product_type is not null
       group by lower(p.product_type)
       order by count(*) desc
       limit 1;
    end if;
  else
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
  end if;

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

revoke all on function public.create_customer_product(uuid, text, uuid, text, text, uuid) from public;
grant execute on function public.create_customer_product(uuid, text, uuid, text, text, uuid) to authenticated;
