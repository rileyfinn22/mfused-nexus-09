-- Create products table
CREATE TABLE public.products (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL,
  name text NOT NULL,
  category text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Create policies for products
CREATE POLICY "Users can view company products"
ON public.products
FOR SELECT
USING (company_id = get_user_company(auth.uid()));

CREATE POLICY "Users can create company products"
ON public.products
FOR INSERT
WITH CHECK (company_id = get_user_company(auth.uid()));

CREATE POLICY "Admins can update company products"
ON public.products
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role) AND company_id = get_user_company(auth.uid()));

CREATE POLICY "Admins can delete company products"
ON public.products
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role) AND company_id = get_user_company(auth.uid()));

-- Create inventory table
CREATE TABLE public.inventory (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  sku text NOT NULL,
  state text NOT NULL,
  available integer NOT NULL DEFAULT 0,
  in_production integer NOT NULL DEFAULT 0,
  redline integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(company_id, sku, state)
);

-- Enable RLS
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

-- Create policies for inventory
CREATE POLICY "Users can view company inventory"
ON public.inventory
FOR SELECT
USING (company_id = get_user_company(auth.uid()));

CREATE POLICY "Users can create company inventory"
ON public.inventory
FOR INSERT
WITH CHECK (company_id = get_user_company(auth.uid()));

CREATE POLICY "Admins can update company inventory"
ON public.inventory
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role) AND company_id = get_user_company(auth.uid()));

CREATE POLICY "Admins can delete company inventory"
ON public.inventory
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role) AND company_id = get_user_company(auth.uid()));

-- Create product_states table to track state-specific product versions
CREATE TABLE public.product_states (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  state text NOT NULL,
  specs text,
  artwork_status text NOT NULL DEFAULT 'pending',
  status text NOT NULL DEFAULT 'active',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(product_id, state)
);

-- Enable RLS
ALTER TABLE public.product_states ENABLE ROW LEVEL SECURITY;

-- Create policies for product_states
CREATE POLICY "Users can view product states"
ON public.product_states
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.products
  WHERE products.id = product_states.product_id
  AND products.company_id = get_user_company(auth.uid())
));

CREATE POLICY "Users can create product states"
ON public.product_states
FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM public.products
  WHERE products.id = product_states.product_id
  AND products.company_id = get_user_company(auth.uid())
));

CREATE POLICY "Admins can update product states"
ON public.product_states
FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::app_role) AND
  EXISTS (
    SELECT 1 FROM public.products
    WHERE products.id = product_states.product_id
    AND products.company_id = get_user_company(auth.uid())
  )
);

CREATE POLICY "Admins can delete product states"
ON public.product_states
FOR DELETE
USING (
  has_role(auth.uid(), 'admin'::app_role) AND
  EXISTS (
    SELECT 1 FROM public.products
    WHERE products.id = product_states.product_id
    AND products.company_id = get_user_company(auth.uid())
  )
);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create triggers for updated_at
CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_inventory_updated_at
  BEFORE UPDATE ON public.inventory
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_product_states_updated_at
  BEFORE UPDATE ON public.product_states
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();