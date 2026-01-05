-- Create table to store sent email history for autocomplete
CREATE TABLE public.sent_email_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  last_used_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  use_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create unique constraint on company_id + email
CREATE UNIQUE INDEX idx_sent_email_history_unique ON public.sent_email_history(company_id, email);

-- Create index for faster lookups
CREATE INDEX idx_sent_email_history_company_email ON public.sent_email_history(company_id, email);

-- Enable RLS
ALTER TABLE public.sent_email_history ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their company email history"
ON public.sent_email_history
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.company_id = sent_email_history.company_id
  )
);

CREATE POLICY "Users can insert email history for their company"
ON public.sent_email_history
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.company_id = sent_email_history.company_id
  )
);

CREATE POLICY "Users can update email history for their company"
ON public.sent_email_history
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.company_id = sent_email_history.company_id
  )
);