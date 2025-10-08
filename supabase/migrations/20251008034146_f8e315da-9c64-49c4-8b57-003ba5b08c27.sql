-- Create table for archived rejected artwork
CREATE TABLE public.rejected_artwork_files (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  original_artwork_id uuid NOT NULL,
  company_id uuid NOT NULL,
  sku text NOT NULL,
  filename text NOT NULL,
  artwork_url text NOT NULL,
  preview_url text,
  notes text,
  rejection_reason text NOT NULL,
  rejected_by uuid,
  rejected_at timestamp with time zone NOT NULL DEFAULT now(),
  original_created_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.rejected_artwork_files ENABLE ROW LEVEL SECURITY;

-- Create policies for rejected artwork
CREATE POLICY "Users can view company rejected artwork"
ON public.rejected_artwork_files
FOR SELECT
USING (company_id = get_user_company(auth.uid()));

CREATE POLICY "Users can create company rejected artwork"
ON public.rejected_artwork_files
FOR INSERT
WITH CHECK (company_id = get_user_company(auth.uid()));

CREATE POLICY "Admins can delete company rejected artwork"
ON public.rejected_artwork_files
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role) AND company_id = get_user_company(auth.uid()));