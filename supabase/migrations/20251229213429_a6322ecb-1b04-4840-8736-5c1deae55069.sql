
-- Create a function to get invitation details for the accept-invite page
-- This needs to be accessible without authentication (for signup flow)
CREATE OR REPLACE FUNCTION public.get_invitation_details(token_param text)
RETURNS TABLE (
  email text,
  company_name text,
  role app_role,
  expires_at timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    ci.email,
    c.name as company_name,
    ci.role,
    ci.expires_at
  FROM public.company_invitations ci
  JOIN public.companies c ON ci.company_id = c.id
  WHERE ci.invitation_token = token_param
    AND ci.status = 'pending'
    AND ci.expires_at > now()
  LIMIT 1
$$;
