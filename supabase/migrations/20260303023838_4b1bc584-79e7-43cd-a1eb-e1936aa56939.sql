
-- Pricing tiers for print products – maps product_type + qty range → unit cost for vendor POs
CREATE TABLE public.print_pricing_tiers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_type text NOT NULL DEFAULT 'label',
  material text,
  min_quantity integer NOT NULL DEFAULT 0,
  max_quantity integer,
  unit_cost numeric NOT NULL DEFAULT 0,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.print_pricing_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vibe admins can manage pricing tiers"
  ON public.print_pricing_tiers FOR ALL
  USING (has_role(auth.uid(), 'vibe_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'vibe_admin'::app_role));

-- Seed some example tiers for labels
INSERT INTO public.print_pricing_tiers (product_type, min_quantity, max_quantity, unit_cost, description) VALUES
  ('label', 0, 999, 0.12, 'Labels under 1,000'),
  ('label', 1000, 4999, 0.08, 'Labels 1,000–4,999'),
  ('label', 5000, 9999, 0.05, 'Labels 5,000–9,999'),
  ('label', 10000, NULL, 0.03, 'Labels 10,000+');
