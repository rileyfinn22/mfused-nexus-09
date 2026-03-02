
-- Create print_templates table
CREATE TABLE public.print_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  product_type text NOT NULL DEFAULT 'label',
  width_inches numeric NOT NULL DEFAULT 4,
  height_inches numeric NOT NULL DEFAULT 6,
  bleed_inches numeric NOT NULL DEFAULT 0.125,
  canvas_data jsonb,
  thumbnail_url text,
  preset_price_per_unit numeric,
  material_options jsonb DEFAULT '[]'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.print_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vibe admins can manage print templates"
  ON public.print_templates FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'vibe_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'vibe_admin'::app_role));

-- Create print_orders table
CREATE TABLE public.print_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  print_template_id uuid REFERENCES public.print_templates(id),
  template_name text NOT NULL,
  canvas_data jsonb,
  print_file_url text,
  material text,
  quantity integer NOT NULL DEFAULT 1,
  price_per_unit numeric,
  total numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  quoted_price numeric,
  quoted_by uuid,
  quoted_at timestamptz,
  order_id uuid REFERENCES public.orders(id),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.print_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vibe admins can manage print orders"
  ON public.print_orders FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'vibe_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'vibe_admin'::app_role));

-- Create print-files storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('print-files', 'print-files', true);

CREATE POLICY "Vibe admins can upload print files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'print-files' AND has_role(auth.uid(), 'vibe_admin'::app_role));

CREATE POLICY "Vibe admins can update print files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'print-files' AND has_role(auth.uid(), 'vibe_admin'::app_role));

CREATE POLICY "Vibe admins can delete print files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'print-files' AND has_role(auth.uid(), 'vibe_admin'::app_role));

CREATE POLICY "Anyone can view print files"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'print-files');
