
-- Create workshop_orders parent table
CREATE TABLE public.workshop_orders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number text NOT NULL,
  company_id uuid REFERENCES public.companies(id),
  status text NOT NULL DEFAULT 'pending',
  subtotal numeric NOT NULL DEFAULT 0,
  tax numeric NOT NULL DEFAULT 0,
  shipping_cost numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  notes text,
  tracking_number text,
  tracking_carrier text,
  tracking_url text,
  production_status text DEFAULT 'pending',
  production_progress integer DEFAULT 0,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Add workshop_order_id to print_orders
ALTER TABLE public.print_orders ADD COLUMN workshop_order_id uuid REFERENCES public.workshop_orders(id);

-- Enable RLS
ALTER TABLE public.workshop_orders ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Vibe admins can manage workshop orders"
ON public.workshop_orders FOR ALL
USING (has_role(auth.uid(), 'vibe_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'vibe_admin'::app_role));

-- Sequence for order numbers
CREATE SEQUENCE public.workshop_order_number_seq START 1001;

-- Function to auto-generate order number
CREATE OR REPLACE FUNCTION public.generate_workshop_order_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    NEW.order_number := 'WO-' || LPAD(nextval('public.workshop_order_number_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER set_workshop_order_number
BEFORE INSERT ON public.workshop_orders
FOR EACH ROW EXECUTE FUNCTION public.generate_workshop_order_number();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.workshop_orders;
