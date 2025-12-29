
-- Create company_invitations table for inviting users to companies
CREATE TABLE public.company_invitations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role app_role NOT NULL DEFAULT 'company',
  invitation_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  status TEXT NOT NULL DEFAULT 'pending',
  invited_by UUID REFERENCES auth.users(id),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.company_invitations ENABLE ROW LEVEL SECURITY;

-- Only vibe_admins can manage company invitations
CREATE POLICY "Vibe admins can view all invitations"
ON public.company_invitations
FOR SELECT
USING (has_role(auth.uid(), 'vibe_admin'::app_role));

CREATE POLICY "Vibe admins can create invitations"
ON public.company_invitations
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'vibe_admin'::app_role));

CREATE POLICY "Vibe admins can update invitations"
ON public.company_invitations
FOR UPDATE
USING (has_role(auth.uid(), 'vibe_admin'::app_role));

CREATE POLICY "Vibe admins can delete invitations"
ON public.company_invitations
FOR DELETE
USING (has_role(auth.uid(), 'vibe_admin'::app_role));

-- Function to accept company invitation (called after user signs up via invite link)
CREATE OR REPLACE FUNCTION public.accept_company_invitation(invitation_token_param text, user_email text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invitation_record record;
  result json;
BEGIN
  -- Get the invitation
  SELECT * INTO invitation_record
  FROM public.company_invitations
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
  UPDATE public.company_invitations
  SET status = 'accepted',
      accepted_at = now()
  WHERE id = invitation_record.id;
  
  -- Create user role for the company
  INSERT INTO public.user_roles (user_id, role, company_id)
  VALUES (auth.uid(), invitation_record.role, invitation_record.company_id)
  ON CONFLICT DO NOTHING;
  
  RETURN json_build_object(
    'success', true,
    'company_id', invitation_record.company_id
  );
END;
$$;
