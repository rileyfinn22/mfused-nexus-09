-- Create customer_addresses table
CREATE TABLE public.customer_addresses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  customer_phone TEXT,
  address_type TEXT NOT NULL DEFAULT 'shipping',
  name TEXT NOT NULL,
  street TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  zip TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view company addresses"
  ON public.customer_addresses FOR SELECT
  USING (company_id = get_user_company(auth.uid()));

CREATE POLICY "Users can create company addresses"
  ON public.customer_addresses FOR INSERT
  WITH CHECK (company_id = get_user_company(auth.uid()));

CREATE POLICY "Users can update company addresses"
  ON public.customer_addresses FOR UPDATE
  USING (company_id = get_user_company(auth.uid()));

CREATE POLICY "Users can delete company addresses"
  ON public.customer_addresses FOR DELETE
  USING (company_id = get_user_company(auth.uid()));

-- Add trigger for updated_at
CREATE TRIGGER update_customer_addresses_updated_at
  BEFORE UPDATE ON public.customer_addresses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add draft status option to orders (update existing status to support 'draft')
-- Orders can now be 'draft', 'pending', 'confirmed', 'in production', etc.