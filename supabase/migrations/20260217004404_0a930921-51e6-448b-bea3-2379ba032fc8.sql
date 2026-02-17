
CREATE OR REPLACE FUNCTION public.accept_company_invitation(invitation_token_param text, user_email text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  invitation_record record;
  other_invite record;
BEGIN
  -- Get the primary invitation
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
  
  -- Accept the primary invitation
  UPDATE public.company_invitations
  SET status = 'accepted', accepted_at = now()
  WHERE id = invitation_record.id;
  
  INSERT INTO public.user_roles (user_id, role, company_id)
  VALUES (auth.uid(), invitation_record.role, invitation_record.company_id)
  ON CONFLICT DO NOTHING;
  
  -- Auto-accept ALL other pending invitations for the same email
  FOR other_invite IN
    SELECT * FROM public.company_invitations
    WHERE email = user_email
      AND status = 'pending'
      AND expires_at > now()
      AND id != invitation_record.id
  LOOP
    UPDATE public.company_invitations
    SET status = 'accepted', accepted_at = now()
    WHERE id = other_invite.id;
    
    INSERT INTO public.user_roles (user_id, role, company_id)
    VALUES (auth.uid(), other_invite.role, other_invite.company_id)
    ON CONFLICT DO NOTHING;
  END LOOP;
  
  RETURN json_build_object(
    'success', true,
    'company_id', invitation_record.company_id
  );
END;
$function$;
