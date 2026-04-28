UPDATE public.invoices
SET billed_percentage = NULL
WHERE parent_invoice_id IS NOT NULL
  AND notes ILIKE 'Pull & Ship Order:%'
  AND billed_percentage IS NOT NULL
  AND billed_percentage < 100
  AND deleted_at IS NULL;