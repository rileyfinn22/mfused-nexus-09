-- Add missing foreign key constraint from payments to invoices
ALTER TABLE public.payments
ADD CONSTRAINT payments_invoice_id_fkey 
FOREIGN KEY (invoice_id) 
REFERENCES public.invoices(id) 
ON DELETE CASCADE;