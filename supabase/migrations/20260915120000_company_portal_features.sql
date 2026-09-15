-- Per-company portal switches, starting with the grouped order picker for Nutrastrips.
--
-- Nutrastrips orders for several brands and wants the "Add items" picker to lay products out
-- by brand and then by kind (Boxes / Foils / Other) with quantities entered right there. That
-- layout only makes sense for a catalog organised that way, so it is switched on per company
-- through companies.portal_features rather than shown to everyone.
--
-- Shape of portal_features.order_picker (absent = the plain flat picker every company has today):
--   { "groups": [ { "key": "boxes", "label": "Boxes", "product_types": ["box", "paperboard"] },
--                 { "key": "foils", "label": "Foils", "product_types": ["pouches", "pouch", "bag"] } ],
--     "other_label": "Other" }
-- Products are placed in the first group whose product_types contains their products.product_type;
-- anything else (including a null type) lands under other_label.

alter table public.companies
  add column if not exists portal_features jsonb not null default '{}'::jsonb;

comment on column public.companies.portal_features is
  'Per-company portal switches (jsonb). Known keys: order_picker {groups[], other_label}.';

-- Nutrastrips: switch on the grouped picker.
update public.companies
   set portal_features = portal_features || jsonb_build_object(
     'order_picker', jsonb_build_object(
       'groups', jsonb_build_array(
         jsonb_build_object('key', 'boxes', 'label', 'Boxes', 'product_types', jsonb_build_array('box', 'paperboard')),
         jsonb_build_object('key', 'foils', 'label', 'Foils', 'product_types', jsonb_build_array('pouches', 'pouch', 'bag'))
       ),
       'other_label', 'Other'
     )
   )
 where id = '21d368c7-dda4-49ee-be87-3d0e553e2ca4';

-- Nutrastrips products carry no product_type yet; their template names say what they are.
-- Only fills blanks, so a type set by hand is never overwritten.
update public.products p
   set product_type = case
                        when lower(t.name) like '%box%'  then 'box'
                        when lower(t.name) like '%foil%' then 'pouches'
                      end
  from public.product_templates t
 where p.template_id = t.id
   and p.company_id = '21d368c7-dda4-49ee-be87-3d0e553e2ca4'
   and p.product_type is null
   and (lower(t.name) like '%box%' or lower(t.name) like '%foil%');
