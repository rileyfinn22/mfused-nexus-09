
-- Junction table: which companies can see which templates
-- If a template has NO rows here, it's only visible to vibe_admins (legacy behavior)
-- Templates can be marked is_global on the print_templates table instead
CREATE TABLE public.print_template_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.print_templates(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(template_id, company_id)
);

-- Add is_global flag to print_templates (visible to ALL companies)
ALTER TABLE public.print_templates ADD COLUMN is_global boolean NOT NULL DEFAULT false;

-- Enable RLS
ALTER TABLE public.print_template_companies ENABLE ROW LEVEL SECURITY;

-- Vibe admins can do everything
CREATE POLICY "Vibe admins can manage template assignments"
  ON public.print_template_companies FOR ALL
  USING (has_role(auth.uid(), 'vibe_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'vibe_admin'::app_role));

-- Company users can view assignments for their company
CREATE POLICY "Company users can view their template assignments"
  ON public.print_template_companies FOR SELECT
  USING (company_id IN (
    SELECT ur.company_id FROM user_roles ur WHERE ur.user_id = auth.uid()
  ));
