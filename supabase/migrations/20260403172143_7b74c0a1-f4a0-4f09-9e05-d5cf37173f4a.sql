UPDATE products p
SET description = pt.description,
    product_type = pt.product_type
FROM print_templates pt
WHERE p.print_template_id = pt.id
  AND p.print_template_id IS NOT NULL;