UPDATE products
SET name = REPLACE(name, 'JEFE V2', 'JEFE 2'),
    updated_at = now()
WHERE template_id = '798a51ee-f2ed-462b-a574-f158670bc840';

UPDATE product_templates
SET name = REPLACE(name, 'JEFE V2', 'JEFE 2'),
    updated_at = now()
WHERE id = '798a51ee-f2ed-462b-a574-f158670bc840';