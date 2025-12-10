-- Step 1: Add customer-specific columns to companies table
ALTER TABLE public.companies 
ADD COLUMN IF NOT EXISTS email text,
ADD COLUMN IF NOT EXISTS phone text,
ADD COLUMN IF NOT EXISTS billing_street text,
ADD COLUMN IF NOT EXISTS billing_city text,
ADD COLUMN IF NOT EXISTS billing_state text,
ADD COLUMN IF NOT EXISTS billing_zip text,
ADD COLUMN IF NOT EXISTS shipping_street text,
ADD COLUMN IF NOT EXISTS shipping_city text,
ADD COLUMN IF NOT EXISTS shipping_state text,
ADD COLUMN IF NOT EXISTS shipping_zip text,
ADD COLUMN IF NOT EXISTS quickbooks_id text,
ADD COLUMN IF NOT EXISTS notes text,
ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Step 2: Insert all customers as companies (excluding VibePKG which already exists)
INSERT INTO public.companies (id, name, email, phone, billing_street, billing_city, billing_state, billing_zip, shipping_street, shipping_city, shipping_state, shipping_zip, quickbooks_id, notes, is_active, created_at, updated_at)
SELECT 
  c.id,
  c.name,
  c.email,
  c.phone,
  c.billing_street,
  c.billing_city,
  c.billing_state,
  c.billing_zip,
  c.shipping_street,
  c.shipping_city,
  c.shipping_state,
  c.shipping_zip,
  c.quickbooks_id,
  c.notes,
  c.is_active,
  c.created_at,
  c.updated_at
FROM public.customers c
WHERE NOT EXISTS (SELECT 1 FROM public.companies co WHERE co.id = c.id)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  phone = EXCLUDED.phone,
  billing_street = EXCLUDED.billing_street,
  billing_city = EXCLUDED.billing_city,
  billing_state = EXCLUDED.billing_state,
  billing_zip = EXCLUDED.billing_zip,
  shipping_street = EXCLUDED.shipping_street,
  shipping_city = EXCLUDED.shipping_city,
  shipping_state = EXCLUDED.shipping_state,
  shipping_zip = EXCLUDED.shipping_zip,
  quickbooks_id = EXCLUDED.quickbooks_id,
  notes = EXCLUDED.notes,
  is_active = EXCLUDED.is_active;

-- Step 3: Update products to reference company_id instead of customer_id
-- First, update products where customer_id is set to use that as their company_id
UPDATE public.products 
SET company_id = customer_id 
WHERE customer_id IS NOT NULL;

-- Step 4: Drop the customer_id column from products (no longer needed)
ALTER TABLE public.products DROP COLUMN IF EXISTS customer_id;

-- Step 5: Drop customer_id foreign key constraint from po_submissions if it exists
ALTER TABLE public.po_submissions DROP CONSTRAINT IF EXISTS po_submissions_customer_id_fkey;

-- Step 6: Drop the customers table
DROP TABLE IF EXISTS public.customers CASCADE;

-- Step 7: Update RLS policies on companies to allow more operations
-- Drop existing policies
DROP POLICY IF EXISTS "Admins can update their company" ON public.companies;
DROP POLICY IF EXISTS "Users can create companies" ON public.companies;
DROP POLICY IF EXISTS "Users can view their own company" ON public.companies;
DROP POLICY IF EXISTS "Vibe admins can view all companies" ON public.companies;

-- Create new comprehensive policies
CREATE POLICY "Vibe admins can do everything on companies"
ON public.companies
FOR ALL
USING (has_role(auth.uid(), 'vibe_admin'))
WITH CHECK (has_role(auth.uid(), 'vibe_admin'));

CREATE POLICY "Users can view their own company"
ON public.companies
FOR SELECT
USING (id = get_user_company(auth.uid()));

CREATE POLICY "Admins can update their company"
ON public.companies
FOR UPDATE
USING (has_role(auth.uid(), 'admin') AND id = get_user_company(auth.uid()));