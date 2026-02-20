
CREATE TABLE public.shipment_legs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  leg_number integer NOT NULL DEFAULT 1,
  leg_type text NOT NULL DEFAULT 'domestic',
  label text,
  carrier text,
  tracking_number text,
  tracking_url text,
  origin text,
  destination text,
  shipped_date timestamptz,
  estimated_arrival timestamptz,
  actual_arrival timestamptz,
  status text NOT NULL DEFAULT 'pending',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shipment_legs ENABLE ROW LEVEL SECURITY;

-- Vibe admins: full CRUD
CREATE POLICY "Vibe admins can manage all shipment legs"
  ON public.shipment_legs FOR ALL
  USING (has_role(auth.uid(), 'vibe_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'vibe_admin'::app_role));

-- Company users: SELECT only for their company's orders
CREATE POLICY "Company users can view their shipment legs"
  ON public.shipment_legs FOR SELECT
  USING (user_has_company_access(auth.uid(), company_id));
