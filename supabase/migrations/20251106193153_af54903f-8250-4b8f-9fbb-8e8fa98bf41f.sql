-- Create customers table to manage customer relationships
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  billing_street TEXT,
  billing_city TEXT,
  billing_state TEXT,
  billing_zip TEXT,
  shipping_street TEXT,
  shipping_city TEXT,
  shipping_state TEXT,
  shipping_zip TEXT,
  quickbooks_id TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(company_id, name)
);

-- Enable RLS
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- RLS Policies for customers
CREATE POLICY "Users can view company customers"
  ON public.customers FOR SELECT
  USING (company_id = get_user_company(auth.uid()));

CREATE POLICY "Admins can create company customers"
  ON public.customers FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND company_id = get_user_company(auth.uid()));

CREATE POLICY "Admins can update company customers"
  ON public.customers FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role) AND company_id = get_user_company(auth.uid()));

CREATE POLICY "Admins can delete company customers"
  ON public.customers FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role) AND company_id = get_user_company(auth.uid()));

CREATE POLICY "Vibe admins can view all customers"
  ON public.customers FOR SELECT
  USING (has_role(auth.uid(), 'vibe_admin'::app_role));

CREATE POLICY "Vibe admins can create customers"
  ON public.customers FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'vibe_admin'::app_role));

CREATE POLICY "Vibe admins can update customers"
  ON public.customers FOR UPDATE
  USING (has_role(auth.uid(), 'vibe_admin'::app_role));

CREATE POLICY "Vibe admins can delete customers"
  ON public.customers FOR DELETE
  USING (has_role(auth.uid(), 'vibe_admin'::app_role));

-- Add customer_id to products table
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_products_customer_id ON public.products(customer_id);
CREATE INDEX IF NOT EXISTS idx_customers_company_id ON public.customers(company_id);

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_customers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_customers_updated_at();