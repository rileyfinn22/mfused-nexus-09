
CREATE TABLE public.print_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_type TEXT NOT NULL DEFAULT 'label',
  name TEXT NOT NULL,
  width_inches NUMERIC NOT NULL,
  height_inches NUMERIC NOT NULL,
  depth_inches NUMERIC DEFAULT 0,
  bleed_inches NUMERIC DEFAULT 0.125,
  panel_zones JSONB DEFAULT '[]'::jsonb,
  dieline_data JSONB DEFAULT NULL,
  is_active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.print_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active presets"
  ON public.print_presets FOR SELECT
  USING (is_active = true);

CREATE POLICY "Vibe admins can manage presets"
  ON public.print_presets FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'vibe_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'vibe_admin'));

-- Seed common sizes
INSERT INTO public.print_presets (product_type, name, width_inches, height_inches, depth_inches, bleed_inches, sort_order, panel_zones) VALUES
-- Labels
('label', '2" x 2" Square', 2, 2, 0, 0.125, 1, '[]'),
('label', '2" x 3" Rectangle', 2, 3, 0, 0.125, 2, '[]'),
('label', '3" x 5" Rectangle', 3, 5, 0, 0.125, 3, '[]'),
('label', '4" x 6" Shipping Label', 4, 6, 0, 0.125, 4, '[]'),
('label', '4" x 4" Square', 4, 4, 0, 0.125, 5, '[]'),
('label', '2.5" x 2.5" Circle', 2.5, 2.5, 0, 0.125, 6, '[]'),
('label', '3" x 3" Circle', 3, 3, 0, 0.125, 7, '[]'),
('label', '8.5" x 11" Full Sheet', 8.5, 11, 0, 0.125, 8, '[]'),
-- Boxes
('box', '4x4x4 Small Cube', 4, 4, 4, 0.125, 10, '[{"name":"Front","x":0,"y":4,"w":4,"h":4},{"name":"Back","x":12,"y":4,"w":4,"h":4},{"name":"Left","x":4,"y":4,"w":4,"h":4},{"name":"Right","x":8,"y":4,"w":4,"h":4},{"name":"Top","x":4,"y":0,"w":4,"h":4},{"name":"Bottom","x":4,"y":8,"w":4,"h":4}]'),
('box', '6x6x6 Medium Cube', 6, 6, 6, 0.125, 11, '[{"name":"Front","x":0,"y":6,"w":6,"h":6},{"name":"Back","x":18,"y":6,"w":6,"h":6},{"name":"Left","x":6,"y":6,"w":6,"h":6},{"name":"Right","x":12,"y":6,"w":6,"h":6},{"name":"Top","x":6,"y":0,"w":6,"h":6},{"name":"Bottom","x":6,"y":12,"w":6,"h":6}]'),
('box', '8x6x4 Mailer Box', 8, 6, 4, 0.125, 12, '[{"name":"Front","x":0,"y":4,"w":8,"h":6},{"name":"Back","x":14,"y":4,"w":8,"h":6},{"name":"Left","x":8,"y":4,"w":6,"h":6},{"name":"Right","x":22,"y":4,"w":6,"h":6},{"name":"Top","x":8,"y":0,"w":8,"h":4},{"name":"Bottom","x":8,"y":10,"w":8,"h":4}]'),
('box', '10x8x4 Product Box', 10, 8, 4, 0.125, 13, '[{"name":"Front","x":0,"y":4,"w":10,"h":8},{"name":"Back","x":18,"y":4,"w":10,"h":8},{"name":"Left","x":10,"y":4,"w":8,"h":8},{"name":"Right","x":28,"y":4,"w":8,"h":8},{"name":"Top","x":10,"y":0,"w":10,"h":4},{"name":"Bottom","x":10,"y":12,"w":10,"h":4}]'),
('box', '12x12x6 Large Box', 12, 12, 6, 0.125, 14, '[{"name":"Front","x":0,"y":6,"w":12,"h":12},{"name":"Back","x":24,"y":6,"w":12,"h":12},{"name":"Left","x":12,"y":6,"w":12,"h":12},{"name":"Right","x":36,"y":6,"w":12,"h":12},{"name":"Top","x":12,"y":0,"w":12,"h":6},{"name":"Bottom","x":12,"y":18,"w":12,"h":6}]'),
-- Bags
('bag', '5x3x8 Small Bag', 5, 8, 3, 0.125, 20, '[{"name":"Front","x":0,"y":0,"w":5,"h":8},{"name":"Back","x":8,"y":0,"w":5,"h":8},{"name":"Left Gusset","x":5,"y":0,"w":3,"h":8},{"name":"Right Gusset","x":13,"y":0,"w":3,"h":8}]'),
('bag', '8x4x10 Medium Bag', 8, 10, 4, 0.125, 21, '[{"name":"Front","x":0,"y":0,"w":8,"h":10},{"name":"Back","x":12,"y":0,"w":8,"h":10},{"name":"Left Gusset","x":8,"y":0,"w":4,"h":10},{"name":"Right Gusset","x":20,"y":0,"w":4,"h":10}]'),
('bag', '10x5x13 Large Bag', 10, 13, 5, 0.125, 22, '[{"name":"Front","x":0,"y":0,"w":10,"h":13},{"name":"Back","x":15,"y":0,"w":10,"h":13},{"name":"Left Gusset","x":10,"y":0,"w":5,"h":13},{"name":"Right Gusset","x":25,"y":0,"w":5,"h":13}]'),
('bag', '16x6x12 Shopping Bag', 16, 12, 6, 0.125, 23, '[{"name":"Front","x":0,"y":0,"w":16,"h":12},{"name":"Back","x":22,"y":0,"w":16,"h":12},{"name":"Left Gusset","x":16,"y":0,"w":6,"h":12},{"name":"Right Gusset","x":38,"y":0,"w":6,"h":12}]');
