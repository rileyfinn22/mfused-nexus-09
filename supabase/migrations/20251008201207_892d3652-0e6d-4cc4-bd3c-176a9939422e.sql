-- Create vendors table
CREATE TABLE public.vendors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id),
  name TEXT NOT NULL,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on vendors
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;

-- RLS policies for vendors
CREATE POLICY "Users can view company vendors"
  ON public.vendors FOR SELECT
  USING (company_id = get_user_company(auth.uid()));

CREATE POLICY "Admins can create company vendors"
  ON public.vendors FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin') AND company_id = get_user_company(auth.uid()));

CREATE POLICY "Admins can update company vendors"
  ON public.vendors FOR UPDATE
  USING (has_role(auth.uid(), 'admin') AND company_id = get_user_company(auth.uid()));

CREATE POLICY "Admins can delete company vendors"
  ON public.vendors FOR DELETE
  USING (has_role(auth.uid(), 'admin') AND company_id = get_user_company(auth.uid()));

CREATE POLICY "Vibe admins can view all vendors"
  ON public.vendors FOR SELECT
  USING (has_role(auth.uid(), 'vibe_admin'));

-- Add vendor fields to order_items
ALTER TABLE public.order_items 
  ADD COLUMN vendor_id UUID REFERENCES public.vendors(id),
  ADD COLUMN vendor_cost NUMERIC,
  ADD COLUMN vendor_po_number TEXT;

-- Create invoices table
CREATE TABLE public.invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id),
  order_id UUID NOT NULL REFERENCES public.orders(id),
  invoice_number TEXT NOT NULL,
  invoice_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  due_date TIMESTAMP WITH TIME ZONE,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  tax NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS on invoices
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- RLS policies for invoices
CREATE POLICY "Users can view company invoices"
  ON public.invoices FOR SELECT
  USING (company_id = get_user_company(auth.uid()));

CREATE POLICY "Admins can create company invoices"
  ON public.invoices FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin') AND company_id = get_user_company(auth.uid()));

CREATE POLICY "Admins can update company invoices"
  ON public.invoices FOR UPDATE
  USING (has_role(auth.uid(), 'admin') AND company_id = get_user_company(auth.uid()));

CREATE POLICY "Vibe admins can view all invoices"
  ON public.invoices FOR SELECT
  USING (has_role(auth.uid(), 'vibe_admin'));

CREATE POLICY "Vibe admins can update all invoices"
  ON public.invoices FOR UPDATE
  USING (has_role(auth.uid(), 'vibe_admin'));

-- Create trigger for updated_at on vendors
CREATE TRIGGER update_vendors_updated_at
  BEFORE UPDATE ON public.vendors
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create trigger for updated_at on invoices
CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes
CREATE INDEX idx_vendors_company_id ON public.vendors(company_id);
CREATE INDEX idx_order_items_vendor_id ON public.order_items(vendor_id);
CREATE INDEX idx_invoices_company_id ON public.invoices(company_id);
CREATE INDEX idx_invoices_order_id ON public.invoices(order_id);