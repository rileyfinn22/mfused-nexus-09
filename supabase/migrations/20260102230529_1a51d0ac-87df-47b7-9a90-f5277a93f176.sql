-- Create a function to get vibe admin details with emails
CREATE OR REPLACE FUNCTION public.get_vibe_admins()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  email text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT ur.id, ur.user_id, au.email
  FROM public.user_roles ur
  JOIN auth.users au ON ur.user_id = au.id
  JOIN public.companies c ON ur.company_id = c.id
  WHERE ur.role = 'vibe_admin'
    AND c.name = 'VibePKG'
    AND has_role(auth.uid(), 'vibe_admin')
  ORDER BY au.email
$$;