CREATE UNIQUE INDEX IF NOT EXISTS payments_qb_id_invoice_unique
  ON public.payments (quickbooks_id, invoice_id)
  WHERE quickbooks_id IS NOT NULL;