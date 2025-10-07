-- Create companies table
CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on companies
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- Add company_id to user_roles
ALTER TABLE public.user_roles ADD COLUMN company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

-- Make company_id required and update unique constraint
ALTER TABLE public.user_roles ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_role_key;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_role_company_key UNIQUE (user_id, role, company_id);

-- Add company_id to po_submissions
ALTER TABLE public.po_submissions ADD COLUMN company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.po_submissions ALTER COLUMN company_id DROP DEFAULT;

-- Add company_id to artwork_files
ALTER TABLE public.artwork_files ADD COLUMN company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.artwork_files ALTER COLUMN company_id DROP DEFAULT;

-- Create function to get user's company
CREATE OR REPLACE FUNCTION public.get_user_company(_user_id UUID)
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id
  FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- Create function to check if user belongs to company
CREATE OR REPLACE FUNCTION public.user_in_company(_user_id UUID, _company_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND company_id = _company_id
  )
$$;

-- Update RLS policies for companies table
CREATE POLICY "Users can view their own company"
ON public.companies
FOR SELECT
USING (id = public.get_user_company(auth.uid()));

CREATE POLICY "Admins can update their company"
ON public.companies
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'::app_role) AND id = public.get_user_company(auth.uid()));

-- Update RLS policies for user_roles
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
CREATE POLICY "Users can view own roles"
ON public.user_roles
FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
CREATE POLICY "Admins can view company roles"
ON public.user_roles
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::app_role) AND company_id = public.get_user_company(auth.uid()));

DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
CREATE POLICY "Admins can insert company roles"
ON public.user_roles
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) AND company_id = public.get_user_company(auth.uid()));

DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
CREATE POLICY "Admins can delete company roles"
ON public.user_roles
FOR DELETE
USING (public.has_role(auth.uid(), 'admin'::app_role) AND company_id = public.get_user_company(auth.uid()));

-- Update RLS policies for po_submissions
DROP POLICY IF EXISTS "Customers can view own submissions" ON public.po_submissions;
CREATE POLICY "Users can view own company submissions"
ON public.po_submissions
FOR SELECT
USING (company_id = public.get_user_company(auth.uid()));

DROP POLICY IF EXISTS "Admins can view all submissions" ON public.po_submissions;
CREATE POLICY "Admins can view company submissions"
ON public.po_submissions
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::app_role) AND company_id = public.get_user_company(auth.uid()));

DROP POLICY IF EXISTS "Customers can create submissions" ON public.po_submissions;
CREATE POLICY "Users can create company submissions"
ON public.po_submissions
FOR INSERT
WITH CHECK (company_id = public.get_user_company(auth.uid()));

DROP POLICY IF EXISTS "Admins can update submissions" ON public.po_submissions;
CREATE POLICY "Admins can update company submissions"
ON public.po_submissions
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'::app_role) AND company_id = public.get_user_company(auth.uid()));

-- Update RLS policies for artwork_files
DROP POLICY IF EXISTS "Anyone can view artwork files" ON public.artwork_files;
CREATE POLICY "Users can view company artwork"
ON public.artwork_files
FOR SELECT
USING (company_id = public.get_user_company(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can create artwork" ON public.artwork_files;
CREATE POLICY "Users can create company artwork"
ON public.artwork_files
FOR INSERT
WITH CHECK (company_id = public.get_user_company(auth.uid()));

DROP POLICY IF EXISTS "Admins can update artwork" ON public.artwork_files;
CREATE POLICY "Admins can update company artwork"
ON public.artwork_files
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'::app_role) AND company_id = public.get_user_company(auth.uid()));

DROP POLICY IF EXISTS "Admins can delete artwork" ON public.artwork_files;
CREATE POLICY "Admins can delete company artwork"
ON public.artwork_files
FOR DELETE
USING (public.has_role(auth.uid(), 'admin'::app_role) AND company_id = public.get_user_company(auth.uid()));