CREATE OR REPLACE FUNCTION public.accept_company_invitation(invitation_token_param text, user_email text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  invitation_record record;
  other_invite record;
  v_target_user_id uuid;
BEGIN
  SELECT * INTO invitation_record
  FROM public.company_invitations
  WHERE invitation_token = invitation_token_param
    AND status = 'pending'
    AND expires_at > now()
    AND lower(email) = lower(user_email);

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Invalid or expired invitation');
  END IF;

  -- Resolve the target user by the invitation's email, NOT auth.uid().
  -- auth.uid() reflects whoever is logged in the browser, which may be a
  -- different admin/user and previously caused roles to be silently skipped.
  SELECT id INTO v_target_user_id
  FROM auth.users
  WHERE lower(email) = lower(invitation_record.email)
  LIMIT 1;

  IF v_target_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'User account not found for invited email');
  END IF;

  UPDATE public.company_invitations
  SET status = 'accepted', accepted_at = now()
  WHERE id = invitation_record.id;

  INSERT INTO public.user_roles (user_id, role, company_id)
  VALUES (v_target_user_id, invitation_record.role, invitation_record.company_id)
  ON CONFLICT DO NOTHING;

  FOR other_invite IN
    SELECT * FROM public.company_invitations
    WHERE lower(email) = lower(user_email)
      AND status = 'pending'
      AND expires_at > now()
      AND id != invitation_record.id
  LOOP
    UPDATE public.company_invitations
    SET status = 'accepted', accepted_at = now()
    WHERE id = other_invite.id;

    INSERT INTO public.user_roles (user_id, role, company_id)
    VALUES (v_target_user_id, other_invite.role, other_invite.company_id)
    ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN json_build_object('success', true, 'company_id', invitation_record.company_id);
END;
$function$;