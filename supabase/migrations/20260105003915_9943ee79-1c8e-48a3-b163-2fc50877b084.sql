-- Add address fields for vendors (supports both USA and international)
ALTER TABLE public.vendors
ADD COLUMN address_street TEXT,
ADD COLUMN address_city TEXT,
ADD COLUMN address_state TEXT,
ADD COLUMN address_zip TEXT,
ADD COLUMN address_country TEXT DEFAULT 'USA',

-- Bank information fields
ADD COLUMN bank_name TEXT,
ADD COLUMN bank_account_name TEXT,
ADD COLUMN bank_account_number TEXT,
ADD COLUMN bank_routing_number TEXT,
ADD COLUMN bank_swift_code TEXT,
ADD COLUMN bank_iban TEXT,
ADD COLUMN bank_country TEXT;