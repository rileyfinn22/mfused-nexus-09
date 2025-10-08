-- Create vendor_pos table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.vendor_pos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
  po_number TEXT NOT NULL UNIQUE,
  order_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expected_delivery_date TIMESTAMP WITH TIME ZONE,
  total NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create vendor_po_items table
CREATE TABLE IF NOT EXISTS public.vendor_po_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_po_id UUID NOT NULL REFERENCES public.vendor_pos(id) ON DELETE CASCADE,
  order_item_id UUID NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_cost NUMERIC NOT NULL,
  total NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.vendor_pos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_po_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for vendor_pos
CREATE POLICY "Users can view company vendor POs"
  ON public.vendor_pos FOR SELECT
  USING (company_id = get_user_company(auth.uid()));

CREATE POLICY "Admins can create company vendor POs"
  ON public.vendor_pos FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND company_id = get_user_company(auth.uid()));

CREATE POLICY "Admins can update company vendor POs"
  ON public.vendor_pos FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role) AND company_id = get_user_company(auth.uid()));

CREATE POLICY "Vibe admins can view all vendor POs"
  ON public.vendor_pos FOR SELECT
  USING (has_role(auth.uid(), 'vibe_admin'::app_role));

-- RLS Policies for vendor_po_items
CREATE POLICY "Users can view vendor PO items"
  ON public.vendor_po_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.vendor_pos
    WHERE vendor_pos.id = vendor_po_items.vendor_po_id
    AND vendor_pos.company_id = get_user_company(auth.uid())
  ));

CREATE POLICY "Admins can create vendor PO items"
  ON public.vendor_po_items FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.vendor_pos
    WHERE vendor_pos.id = vendor_po_items.vendor_po_id
    AND vendor_pos.company_id = get_user_company(auth.uid())
    AND has_role(auth.uid(), 'admin'::app_role)
  ));

-- Add trigger for updated_at
CREATE TRIGGER update_vendor_pos_updated_at
  BEFORE UPDATE ON public.vendor_pos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_vendor_pos_order_id ON public.vendor_pos(order_id);
CREATE INDEX IF NOT EXISTS idx_vendor_pos_vendor_id ON public.vendor_pos(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_po_items_vendor_po_id ON public.vendor_po_items(vendor_po_id);