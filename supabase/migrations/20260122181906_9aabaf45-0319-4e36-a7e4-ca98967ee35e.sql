-- Create company_contacts table for multiple contacts per company
CREATE TABLE public.company_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.company_contacts ENABLE ROW LEVEL SECURITY;

-- RLS policies for vibe_admin (full access)
CREATE POLICY "Vibe admins can manage all contacts"
ON public.company_contacts
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'vibe_admin'
  )
);

-- RLS policy for company users (view their own company's contacts)
CREATE POLICY "Company users can view their contacts"
ON public.company_contacts
FOR SELECT
USING (
  company_id IN (
    SELECT ur.company_id FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
  )
);

-- Company users can manage their own company's contacts
CREATE POLICY "Company users can manage their contacts"
ON public.company_contacts
FOR ALL
USING (
  company_id IN (
    SELECT ur.company_id FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
  )
);

-- Create index for faster lookups
CREATE INDEX idx_company_contacts_company_id ON public.company_contacts(company_id);

-- Trigger for updated_at
CREATE TRIGGER update_company_contacts_updated_at
BEFORE UPDATE ON public.company_contacts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();