-- Add 'company' role to the app_role enum
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'company';

-- Update the signup trigger to create 'company' role instead of 'admin'
CREATE OR REPLACE FUNCTION public.handle_new_user_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_company_id uuid;
  company_name_meta text;
BEGIN
  -- Get company name from user metadata
  company_name_meta := NEW.raw_user_meta_data->>'company_name';
  
  -- Only proceed if company name is provided (company signup)
  IF company_name_meta IS NOT NULL AND company_name_meta != '' THEN
    -- Create the company
    INSERT INTO public.companies (name)
    VALUES (company_name_meta)
    RETURNING id INTO new_company_id;
    
    -- Create the user role as 'company' instead of 'admin'
    INSERT INTO public.user_roles (user_id, role, company_id)
    VALUES (NEW.id, 'company', new_company_id);
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Create vendor invitations table
CREATE TABLE IF NOT EXISTS public.vendor_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  vendor_id uuid REFERENCES public.vendors(id) ON DELETE CASCADE NOT NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  invited_by uuid REFERENCES auth.users(id) NOT NULL,
  invitation_token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  accepted_at timestamp with time zone
);

-- Enable RLS on vendor_invitations
ALTER TABLE public.vendor_invitations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for vendor_invitations
CREATE POLICY "Admins can create vendor invitations"
ON public.vendor_invitations
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) 
  AND company_id = get_user_company(auth.uid())
);

CREATE POLICY "Admins can view company vendor invitations"
ON public.vendor_invitations
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  AND company_id = get_user_company(auth.uid())
);

CREATE POLICY "Vibe admins can view all vendor invitations"
ON public.vendor_invitations
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'vibe_admin'::app_role));

CREATE POLICY "Public can view invitations by token"
ON public.vendor_invitations
FOR SELECT
TO anon
USING (true);

-- Update vendors table to allow linking user accounts
CREATE POLICY "Vendors can update their own account"
ON public.vendors
FOR UPDATE
TO authenticated
USING (user_id = auth.uid());

-- Function to accept vendor invitation
CREATE OR REPLACE FUNCTION public.accept_vendor_invitation(
  invitation_token_param text,
  user_email text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  invitation_record record;
  result json;
BEGIN
  -- Get the invitation
  SELECT * INTO invitation_record
  FROM public.vendor_invitations
  WHERE invitation_token = invitation_token_param
    AND status = 'pending'
    AND expires_at > now()
    AND email = user_email;
  
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Invalid or expired invitation'
    );
  END IF;
  
  -- Update the invitation status
  UPDATE public.vendor_invitations
  SET status = 'accepted',
      accepted_at = now()
  WHERE id = invitation_record.id;
  
  -- Link the vendor to the authenticated user
  UPDATE public.vendors
  SET user_id = auth.uid()
  WHERE id = invitation_record.vendor_id;
  
  -- Create vendor role for the user
  INSERT INTO public.user_roles (user_id, role, company_id)
  VALUES (auth.uid(), 'vendor', invitation_record.company_id)
  ON CONFLICT DO NOTHING;
  
  RETURN json_build_object(
    'success', true,
    'vendor_id', invitation_record.vendor_id,
    'company_id', invitation_record.company_id
  );
END;
$$;