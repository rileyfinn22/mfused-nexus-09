
-- Table to persist customer design saves for liability and order tracking
CREATE TABLE public.design_saves (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.print_templates(id) ON DELETE SET NULL,
  template_name TEXT NOT NULL,
  canvas_data JSONB,
  thumbnail_url TEXT,
  print_file_url TEXT,
  source_pdf_path TEXT,
  width_inches NUMERIC NOT NULL DEFAULT 0,
  height_inches NUMERIC NOT NULL DEFAULT 0,
  bleed_inches NUMERIC NOT NULL DEFAULT 0,
  material TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.design_saves ENABLE ROW LEVEL SECURITY;

-- Company users can view their own saved designs
CREATE POLICY "Company users can view their saved designs"
ON public.design_saves FOR SELECT
USING (company_id IN (SELECT ur.company_id FROM user_roles ur WHERE ur.user_id = auth.uid()));

-- Company users can create saved designs
CREATE POLICY "Company users can create saved designs"
ON public.design_saves FOR INSERT
WITH CHECK (company_id IN (SELECT ur.company_id FROM user_roles ur WHERE ur.user_id = auth.uid()));

-- Company users can update their own saved designs
CREATE POLICY "Company users can update their saved designs"
ON public.design_saves FOR UPDATE
USING (created_by = auth.uid());

-- Company users can delete their own saved designs
CREATE POLICY "Company users can delete their saved designs"
ON public.design_saves FOR DELETE
USING (created_by = auth.uid());

-- Vibe admins can manage all saved designs
CREATE POLICY "Vibe admins can manage all saved designs"
ON public.design_saves FOR ALL
USING (has_role(auth.uid(), 'vibe_admin'))
WITH CHECK (has_role(auth.uid(), 'vibe_admin'));

-- Trigger for updated_at
CREATE TRIGGER update_design_saves_updated_at
BEFORE UPDATE ON public.design_saves
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
