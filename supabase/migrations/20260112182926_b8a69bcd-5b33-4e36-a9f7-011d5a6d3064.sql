-- Create company_emails table for storing multiple emails per company
CREATE TABLE public.company_emails (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  label TEXT DEFAULT 'general', -- e.g., 'billing', 'orders', 'general', 'shipping'
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(company_id, email)
);

-- Enable RLS
ALTER TABLE public.company_emails ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view company emails" 
ON public.company_emails 
FOR SELECT 
USING (company_id = get_user_company(auth.uid()));

CREATE POLICY "Vibe admins can view all company emails" 
ON public.company_emails 
FOR SELECT 
USING (has_role(auth.uid(), 'vibe_admin'::app_role));

CREATE POLICY "Vibe admins can create company emails" 
ON public.company_emails 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'vibe_admin'::app_role));

CREATE POLICY "Vibe admins can update company emails" 
ON public.company_emails 
FOR UPDATE 
USING (has_role(auth.uid(), 'vibe_admin'::app_role));

CREATE POLICY "Vibe admins can delete company emails" 
ON public.company_emails 
FOR DELETE 
USING (has_role(auth.uid(), 'vibe_admin'::app_role));

-- Create trigger for updated_at
CREATE TRIGGER update_company_emails_updated_at
BEFORE UPDATE ON public.company_emails
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();