-- Add QuickBooks payment link column to invoices table
ALTER TABLE public.invoices 
ADD COLUMN quickbooks_payment_link text;