
-- Create a function to validate company invitations and check if email exists
CREATE OR REPLACE FUNCTION public.validate_company_invitation(invitation_token_param text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invitation_record RECORD;
  email_exists_flag boolean;
BEGIN
  -- Find the invitation
  SELECT ci.*, c.name as company_name
  INTO invitation_record
  FROM company_invitations ci
  LEFT JOIN companies c ON ci.company_id = c.id
  WHERE ci.invitation_token = invitation_token_param
    AND ci.status = 'pending'
    AND ci.expires_at > now();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Invitation is invalid or has expired');
  END IF;

  -- Check if email already exists in auth.users
  SELECT EXISTS(
    SELECT 1 FROM auth.users WHERE email = invitation_record.email
  ) INTO email_exists_flag;

  RETURN jsonb_build_object(
    'valid', true,
    'email', invitation_record.email,
    'company_name', invitation_record.company_name,
    'role', invitation_record.role::text,
    'email_exists', email_exists_flag
  );
END;
$$;
