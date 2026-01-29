-- Create a function to get users for a specific company with their emails
-- Only accessible by vibe admins
CREATE OR REPLACE FUNCTION public.get_company_users(p_company_id uuid)
RETURNS TABLE(id uuid, user_id uuid, email text, role app_role)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ur.id, ur.user_id, au.email, ur.role
  FROM public.user_roles ur
  JOIN auth.users au ON ur.user_id = au.id
  WHERE ur.company_id = p_company_id
    AND has_role(auth.uid(), 'vibe_admin')
  ORDER BY au.email
$$;

-- Create a function to get all users (for vibe admins to assign to companies)
CREATE OR REPLACE FUNCTION public.get_all_portal_users()
RETURNS TABLE(user_id uuid, email text, companies text[])
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    au.id as user_id,
    au.email,
    ARRAY_AGG(c.name ORDER BY c.name) FILTER (WHERE c.name IS NOT NULL) as companies
  FROM auth.users au
  LEFT JOIN public.user_roles ur ON au.id = ur.user_id
  LEFT JOIN public.companies c ON ur.company_id = c.id
  WHERE has_role(auth.uid(), 'vibe_admin')
  GROUP BY au.id, au.email
  ORDER BY au.email
$$;