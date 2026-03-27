
UPDATE print_templates
SET canvas_data = (
  SELECT jsonb_set(
    pt_inner.canvas_data,
    '{objects}',
    (
      SELECT jsonb_agg(
        CASE 
          WHEN elem->>'type' IN ('Textbox', 'IText', 'Text')
            AND (elem->>'left')::numeric + (elem->>'width')::numeric > 316.75
          THEN jsonb_set(elem, '{width}', to_jsonb(round((316.75 - (elem->>'left')::numeric)::numeric, 2)))
          ELSE elem
        END
      )
      FROM jsonb_array_elements(pt_inner.canvas_data->'objects') elem
    )
  )
  FROM print_templates pt_inner
  WHERE pt_inner.id = print_templates.id
)
WHERE EXISTS (
  SELECT 1 FROM jsonb_array_elements(canvas_data->'objects') elem
  WHERE elem->>'type' IN ('Textbox', 'IText', 'Text')
    AND (elem->>'left')::numeric + (elem->>'width')::numeric > 316.75
);
