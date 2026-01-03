-- Add billing_email field to companies for AP/billing contacts
ALTER TABLE public.companies
ADD COLUMN billing_email text;