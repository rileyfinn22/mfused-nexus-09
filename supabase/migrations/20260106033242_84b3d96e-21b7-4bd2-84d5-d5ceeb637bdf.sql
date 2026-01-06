-- Create product_templates table for storing reusable product templates
CREATE TABLE public.product_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10,2) DEFAULT 0,
  cost NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.product_templates ENABLE ROW LEVEL SECURITY;

-- Policies for product templates
CREATE POLICY "Users can view templates for their company or global templates"
ON public.product_templates
FOR SELECT
USING (
  company_id IS NULL OR
  company_id IN (
    SELECT company_id FROM public.user_roles WHERE user_id = auth.uid()
  ) OR
  EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'vibe_admin'
  )
);

CREATE POLICY "Vibe admins can manage all templates"
ON public.product_templates
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'vibe_admin'
  )
);

-- Trigger for updated_at
CREATE TRIGGER update_product_templates_updated_at
BEFORE UPDATE ON public.product_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert the mfused templates (global templates with NULL company_id)
INSERT INTO public.product_templates (name, description, company_id) VALUES
('Sleeves', 'Size: 152mm x 78mm x 32mm
Material: 235G + 235G Laser Silver Holo Paperboard
Print: CMYK + Premium White : Double Sided
Finish: Double Sided Spot UV', NULL),

('2pk Fatty Bags', 'Size: 2.95" W x 6.4" H
Material: PET/RainbowHoloMET/PCRPE, 7mil
Print: 4CP + Premium White
Finish: Soft Touch Coating + Spot Gloss
CR: NO ZIPPER
Hang Hole: Yes
Tear Notch: No', NULL),

('5pk Fatty Bags', 'Size: 3.7" W x 6.4" H x 2.4 G
Material: PET/RainbowHoloMET/PCRPE, 7mil
Print: 4CP + Premium White
Finish: Soft Touch Coating + Spot Gloss
CR: NO ZIPPER
Hang Hole: Yes
Tear Notch: No', NULL),

('WA Jefe 1G Bags', 'Size: 3.7" W x 6.4" H x 2.4 G
Material: PET/RainbowHoloMET/PCRPE, 7mil
Print: 4CP + Premium White
Finish: Soft Touch Coating + Spot Gloss
CR: NO ZIPPER
Hang Hole: Yes
Tear Notch: No', NULL),

('Tin Merch Packs', 'Size: 3.875 x 7 x 6.0625
Material: Board: .018 SBS
Print: 4CP + Premium White
Finish: Satin AQ
Assembled Insert: Yes', NULL),

('2pk Merch Packs', 'Size: 3.065 x 8.875 x 6.875
Material: Board: .018 SBS
Print: 4CP + Premium White
Finish: Satin AQ', NULL),

('5pk Merch Pack', 'Size: 3.875 x 7 x 6.0625
Material: Board: .018 SBS
Print: 4CP + Premium White
Finish: Satin AQ', NULL),

('Vape Bag Merch Pack', 'Size: 3.875 x 7 x 6.0625
Material: Board: .018 SBS
Print: 4CP + Premium White
Finish: Satin AQ', NULL),

('Super Fog Tin', 'Size: 120mm x 70mm x 30mm
Print: Black Metalized
Material: Tin Plate
Embossed Design: Yes
CR: Yes', NULL),

('Super Fog Tin (No emboss-Lid Printed)', 'Size: 120mm x 70mm x 30mm
Print: Black Metalized
Material: Tin Plate
Embossed Design: No
CR: Yes', NULL),

('Custom Super Fog Tin', 'Size: 120mm x 70mm x 30mm
Print: Custom
Material: Tin Plate
Embossed Design: Custom
CR: Yes', NULL);