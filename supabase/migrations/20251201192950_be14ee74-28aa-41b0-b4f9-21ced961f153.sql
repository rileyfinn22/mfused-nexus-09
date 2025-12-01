-- Allow invoice audit logs to reference invoices that may already be deleted
ALTER TABLE public.invoice_audit_log
  DROP CONSTRAINT IF EXISTS invoice_audit_log_invoice_id_fkey;