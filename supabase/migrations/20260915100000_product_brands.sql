-- Brands: a grouping one level above product templates, owned by the client company.
--
-- Nutrastrips orders packaging on behalf of several brands (Curapeptix, Dissolvd, Zilis, ...).
-- Their templates already encode brand x format ("CURAPEPTIX Boxes", "CURAPEPTIX FOILS"), so
-- the brand is the axis they filter on: Products, Artwork, and the order item picker all
-- narrow to one brand. Any company can use it; a company with no brand rows sees no change.
--
-- Model
--   product_brands            one row per (company, brand name)
--   product_templates.brand_id   the folder's brand
--   products.brand_id            the SKU's brand. Kept in sync from the template by triggers so
--                                every read path can filter on products.brand_id alone; a loose
--                                product (no template) carries its own brand.
--   Artwork has no brand column: artwork_files links to products by SKU, so artwork's brand is
--   its product's brand.
--
-- Access
--   Company members (the `company` / `customer` roles) manage their own brands directly via RLS.
--   Assigning a brand to a template or product goes through two SECURITY DEFINER RPCs because
--   buyers have no UPDATE grant on products / product_templates, and we do not want to open one:
--   the RPCs write only brand_id and check that brand and target belong to the caller's company.

-- 1. Table -------------------------------------------------------------------------------

create table if not exists public.product_brands (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  name        text not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint product_brands_name_not_blank check (length(btrim(name)) > 0)
);

create unique index if not exists product_brands_company_name_key
  on public.product_brands (company_id, lower(btrim(name)));

create index if not exists product_brands_company_id_idx
  on public.product_brands (company_id);

drop trigger if exists update_product_brands_updated_at on public.product_brands;
create trigger update_product_brands_updated_at
  before update on public.product_brands
  for each row execute function public.update_updated_at_column();

-- 2. Columns -----------------------------------------------------------------------------

alter table public.products
  add column if not exists brand_id uuid references public.product_brands(id) on delete set null;

alter table public.product_templates
  add column if not exists brand_id uuid references public.product_brands(id) on delete set null;

create index if not exists products_brand_id_idx on public.products (brand_id);
create index if not exists product_templates_brand_id_idx on public.product_templates (brand_id);

-- 3. RLS ---------------------------------------------------------------------------------

alter table public.product_brands enable row level security;

drop policy if exists "Company members and vibe admins can view brands" on public.product_brands;
create policy "Company members and vibe admins can view brands"
  on public.product_brands for select to authenticated
  using (
    public.has_role(auth.uid(), 'vibe_admin'::app_role)
    or public.user_has_company_access(auth.uid(), company_id)
  );

drop policy if exists "Company members and vibe admins can create brands" on public.product_brands;
create policy "Company members and vibe admins can create brands"
  on public.product_brands for insert to authenticated
  with check (
    public.has_role(auth.uid(), 'vibe_admin'::app_role)
    or public.user_has_company_access(auth.uid(), company_id)
  );

drop policy if exists "Company members and vibe admins can update brands" on public.product_brands;
create policy "Company members and vibe admins can update brands"
  on public.product_brands for update to authenticated
  using (
    public.has_role(auth.uid(), 'vibe_admin'::app_role)
    or public.user_has_company_access(auth.uid(), company_id)
  )
  with check (
    public.has_role(auth.uid(), 'vibe_admin'::app_role)
    or public.user_has_company_access(auth.uid(), company_id)
  );

drop policy if exists "Company members and vibe admins can delete brands" on public.product_brands;
create policy "Company members and vibe admins can delete brands"
  on public.product_brands for delete to authenticated
  using (
    public.has_role(auth.uid(), 'vibe_admin'::app_role)
    or public.user_has_company_access(auth.uid(), company_id)
  );

-- 4. Keep products.brand_id in step with the template ------------------------------------

-- A product joining a template takes the template's brand unless the same statement set a
-- brand explicitly. Runs as definer so the cascade below is not blocked by the caller's RLS.
create or replace function public.inherit_brand_from_template()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_template_brand uuid;
begin
  if new.template_id is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.brand_id is null then
      select brand_id into v_template_brand from public.product_templates where id = new.template_id;
      new.brand_id := v_template_brand;
    end if;
  elsif new.template_id is distinct from old.template_id
        and new.brand_id is not distinct from old.brand_id then
    select brand_id into v_template_brand from public.product_templates where id = new.template_id;
    if v_template_brand is not null then
      new.brand_id := v_template_brand;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_products_inherit_brand on public.products;
create trigger trg_products_inherit_brand
  before insert or update of template_id on public.products
  for each row execute function public.inherit_brand_from_template();

-- Re-branding a template moves its products with it. Products that were given a different brand
-- on purpose are left alone.
create or replace function public.cascade_template_brand()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.brand_id is distinct from old.brand_id then
    update public.products
       set brand_id = new.brand_id
     where template_id = new.id
       and (brand_id is null or brand_id is not distinct from old.brand_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_product_templates_cascade_brand on public.product_templates;
create trigger trg_product_templates_cascade_brand
  after update of brand_id on public.product_templates
  for each row execute function public.cascade_template_brand();

-- 5. Assignment RPCs (the only brand write path for buyers) ------------------------------

create or replace function public.set_template_brand(p_template_id uuid, p_brand_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_uid        uuid := auth.uid();
  v_company_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select company_id into v_company_id from public.product_templates where id = p_template_id;
  if v_company_id is null then
    raise exception 'template not found or has no company';
  end if;

  if not (public.has_role(v_uid, 'vibe_admin'::app_role)
          or public.user_has_company_access(v_uid, v_company_id)) then
    raise exception 'not allowed';
  end if;

  if p_brand_id is not null and not exists (
    select 1 from public.product_brands where id = p_brand_id and company_id = v_company_id
  ) then
    raise exception 'brand does not belong to this company';
  end if;

  update public.product_templates set brand_id = p_brand_id where id = p_template_id;
end;
$$;

create or replace function public.set_product_brand(p_product_id uuid, p_brand_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_uid        uuid := auth.uid();
  v_company_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select company_id into v_company_id from public.products where id = p_product_id;
  if v_company_id is null then
    raise exception 'product not found';
  end if;

  if not (public.has_role(v_uid, 'vibe_admin'::app_role)
          or public.user_has_company_access(v_uid, v_company_id)) then
    raise exception 'not allowed';
  end if;

  if p_brand_id is not null and not exists (
    select 1 from public.product_brands where id = p_brand_id and company_id = v_company_id
  ) then
    raise exception 'brand does not belong to this company';
  end if;

  update public.products set brand_id = p_brand_id where id = p_product_id;
end;
$$;

revoke all on function public.set_template_brand(uuid, uuid) from public;
grant execute on function public.set_template_brand(uuid, uuid) to authenticated;

revoke all on function public.set_product_brand(uuid, uuid) from public;
grant execute on function public.set_product_brand(uuid, uuid) to authenticated;

-- 6. Seed Nutrastrips from their existing templates --------------------------------------
--
-- Additive and idempotent: creates the six brands if missing, tags only templates that have no
-- brand yet, and the cascade trigger carries the brand down to their products.

do $$
declare
  v_company uuid := '21d368c7-dda4-49ee-be87-3d0e553e2ca4';  -- Nutrastrips
begin
  if not exists (select 1 from public.companies where id = v_company) then
    return;
  end if;

  insert into public.product_brands (company_id, name, sort_order)
  values
    (v_company, 'Curapeptix',        1),
    (v_company, 'Dissolvd',          2),
    (v_company, 'Flamingo',          3),
    (v_company, 'Hallandale Health', 4),
    (v_company, 'MedStript',         5),
    (v_company, 'Zilis',             6)
  on conflict (company_id, lower(btrim(name))) do nothing;

  update public.product_templates t
     set brand_id = b.id
    from public.product_brands b
   where b.company_id = v_company
     and t.company_id = v_company
     and t.brand_id is null
     and lower(t.name) like lower(b.name) || '%';

  -- Belt and braces in case the cascade trigger was not yet in place for an earlier row.
  update public.products p
     set brand_id = t.brand_id
    from public.product_templates t
   where p.template_id = t.id
     and p.company_id = v_company
     and p.brand_id is null
     and t.brand_id is not null;
end;
$$;
