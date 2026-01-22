-- Add address fields to company_contacts table
ALTER TABLE public.company_contacts
ADD COLUMN street TEXT,
ADD COLUMN city TEXT,
ADD COLUMN state TEXT,
ADD COLUMN zip TEXT;