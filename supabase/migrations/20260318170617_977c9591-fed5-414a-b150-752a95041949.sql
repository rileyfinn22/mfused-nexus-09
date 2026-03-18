-- 1. Assign all new Mfused templates to both Mfused and Mfused Ventures
INSERT INTO print_template_companies (template_id, company_id) VALUES
  ('1b600f47-9876-45ee-83ae-9e49c5516abf', 'f50dc23d-65b2-4405-b8d1-ab60b4fe53c7'),
  ('1b600f47-9876-45ee-83ae-9e49c5516abf', '2d5bf55c-c834-470f-8e9e-79ebc062e843'),
  ('85745592-36fe-4613-9652-c412c270aee3', 'f50dc23d-65b2-4405-b8d1-ab60b4fe53c7'),
  ('85745592-36fe-4613-9652-c412c270aee3', '2d5bf55c-c834-470f-8e9e-79ebc062e843'),
  ('d20af7a4-3484-497e-924d-448467c8bb8e', 'f50dc23d-65b2-4405-b8d1-ab60b4fe53c7'),
  ('d20af7a4-3484-497e-924d-448467c8bb8e', '2d5bf55c-c834-470f-8e9e-79ebc062e843'),
  ('43607758-f0d6-4e03-8a9c-432b0f64b567', 'f50dc23d-65b2-4405-b8d1-ab60b4fe53c7'),
  ('43607758-f0d6-4e03-8a9c-432b0f64b567', '2d5bf55c-c834-470f-8e9e-79ebc062e843'),
  ('f5258846-1f76-48de-8e2f-4b4bcb14810e', 'f50dc23d-65b2-4405-b8d1-ab60b4fe53c7'),
  ('f5258846-1f76-48de-8e2f-4b4bcb14810e', '2d5bf55c-c834-470f-8e9e-79ebc062e843'),
  ('375dcb1d-d7f5-4290-9199-5fd69096a5df', 'f50dc23d-65b2-4405-b8d1-ab60b4fe53c7'),
  ('375dcb1d-d7f5-4290-9199-5fd69096a5df', '2d5bf55c-c834-470f-8e9e-79ebc062e843'),
  ('5b28a545-3a9c-41f9-aa25-d012d4ef2cf0', 'f50dc23d-65b2-4405-b8d1-ab60b4fe53c7'),
  ('5b28a545-3a9c-41f9-aa25-d012d4ef2cf0', '2d5bf55c-c834-470f-8e9e-79ebc062e843'),
  ('979fc423-45cc-4c95-8276-267de7f27d05', 'f50dc23d-65b2-4405-b8d1-ab60b4fe53c7'),
  ('979fc423-45cc-4c95-8276-267de7f27d05', '2d5bf55c-c834-470f-8e9e-79ebc062e843'),
  ('3cdc98cc-0650-4abd-ae7a-c77ca24bcbe3', 'f50dc23d-65b2-4405-b8d1-ab60b4fe53c7'),
  ('3cdc98cc-0650-4abd-ae7a-c77ca24bcbe3', '2d5bf55c-c834-470f-8e9e-79ebc062e843'),
  ('ff046b8f-e556-424e-8caf-2c3d65f3f282', 'f50dc23d-65b2-4405-b8d1-ab60b4fe53c7'),
  ('ff046b8f-e556-424e-8caf-2c3d65f3f282', '2d5bf55c-c834-470f-8e9e-79ebc062e843')
ON CONFLICT DO NOTHING;

-- 2. Fix FK constraints so templates can be deleted
ALTER TABLE print_template_companies
  DROP CONSTRAINT print_template_companies_template_id_fkey,
  ADD CONSTRAINT print_template_companies_template_id_fkey
    FOREIGN KEY (template_id) REFERENCES print_templates(id) ON DELETE CASCADE;

ALTER TABLE print_orders
  DROP CONSTRAINT print_orders_print_template_id_fkey,
  ADD CONSTRAINT print_orders_print_template_id_fkey
    FOREIGN KEY (print_template_id) REFERENCES print_templates(id) ON DELETE SET NULL;

ALTER TABLE design_saves
  DROP CONSTRAINT design_saves_template_id_fkey,
  ADD CONSTRAINT design_saves_template_id_fkey
    FOREIGN KEY (template_id) REFERENCES print_templates(id) ON DELETE SET NULL;