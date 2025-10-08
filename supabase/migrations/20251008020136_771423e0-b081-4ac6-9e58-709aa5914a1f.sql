-- Create orders table
CREATE TABLE public.orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  po_number TEXT,
  company_id UUID NOT NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  customer_phone TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  order_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  due_date TIMESTAMP WITH TIME ZONE,
  shipping_name TEXT NOT NULL,
  shipping_street TEXT NOT NULL,
  shipping_city TEXT NOT NULL,
  shipping_state TEXT NOT NULL,
  shipping_zip TEXT NOT NULL,
  billing_name TEXT,
  billing_street TEXT,
  billing_city TEXT,
  billing_state TEXT,
  billing_zip TEXT,
  subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax NUMERIC(10,2) NOT NULL DEFAULT 0,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  terms TEXT DEFAULT 'Net 30',
  memo TEXT,
  tracking_number TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create order_items table
CREATE TABLE public.order_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  sku TEXT NOT NULL,
  item_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  quantity INTEGER NOT NULL,
  unit_price NUMERIC(10,2) NOT NULL,
  total NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create order_notes table for vibe notes
CREATE TABLE public.order_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  author_name TEXT NOT NULL,
  note_text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create order_production_updates table
CREATE TABLE public.order_production_updates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  update_text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_production_updates ENABLE ROW LEVEL SECURITY;

-- RLS Policies for orders
CREATE POLICY "Users can view company orders"
  ON public.orders FOR SELECT
  USING (company_id = get_user_company(auth.uid()));

CREATE POLICY "Users can create company orders"
  ON public.orders FOR INSERT
  WITH CHECK (company_id = get_user_company(auth.uid()));

CREATE POLICY "Admins can update company orders"
  ON public.orders FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role) AND company_id = get_user_company(auth.uid()));

CREATE POLICY "Admins can delete company orders"
  ON public.orders FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role) AND company_id = get_user_company(auth.uid()));

-- RLS Policies for order_items
CREATE POLICY "Users can view order items"
  ON public.order_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.orders
    WHERE orders.id = order_items.order_id
    AND orders.company_id = get_user_company(auth.uid())
  ));

CREATE POLICY "Users can create order items"
  ON public.order_items FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.orders
    WHERE orders.id = order_items.order_id
    AND orders.company_id = get_user_company(auth.uid())
  ));

-- RLS Policies for order_notes
CREATE POLICY "Users can view order notes"
  ON public.order_notes FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.orders
    WHERE orders.id = order_notes.order_id
    AND orders.company_id = get_user_company(auth.uid())
  ));

CREATE POLICY "Admins can create order notes"
  ON public.order_notes FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = order_notes.order_id
      AND orders.company_id = get_user_company(auth.uid())
    )
  );

-- RLS Policies for order_production_updates
CREATE POLICY "Admins can view production updates"
  ON public.order_production_updates FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = order_production_updates.order_id
      AND orders.company_id = get_user_company(auth.uid())
    )
  );

CREATE POLICY "Admins can create production updates"
  ON public.order_production_updates FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = order_production_updates.order_id
      AND orders.company_id = get_user_company(auth.uid())
    )
  );

-- Trigger for updated_at
CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();