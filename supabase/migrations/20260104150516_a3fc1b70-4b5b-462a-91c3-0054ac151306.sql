-- Create a table to track QuickBooks import requests requiring admin approval
CREATE TABLE public.qb_import_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  qb_project_id TEXT,
  qb_project_name TEXT NOT NULL,
  qb_customer_id TEXT,
  qb_customer_name TEXT,
  import_type TEXT NOT NULL DEFAULT 'project', -- 'project', 'customer', 'estimate', 'invoice'
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'imported'
  data JSONB, -- Stores the raw QBO data for review
  requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  reviewed_by UUID REFERENCES auth.users(id),
  imported_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.qb_import_requests ENABLE ROW LEVEL SECURITY;

-- Only vibe_admin can view and manage import requests
CREATE POLICY "Vibe admins can view all import requests"
ON public.qb_import_requests
FOR SELECT
USING (public.has_role(auth.uid(), 'vibe_admin'));

CREATE POLICY "Vibe admins can insert import requests"
ON public.qb_import_requests
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'vibe_admin'));

CREATE POLICY "Vibe admins can update import requests"
ON public.qb_import_requests
FOR UPDATE
USING (public.has_role(auth.uid(), 'vibe_admin'));

CREATE POLICY "Vibe admins can delete import requests"
ON public.qb_import_requests
FOR DELETE
USING (public.has_role(auth.uid(), 'vibe_admin'));

-- Add trigger for updated_at
CREATE TRIGGER update_qb_import_requests_updated_at
BEFORE UPDATE ON public.qb_import_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add qb_project_id column to orders table to link orders with QBO projects
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS qb_project_id TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS qb_estimate_id TEXT;

-- Add qb_project_id column to invoices table
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS qb_project_id TEXT;