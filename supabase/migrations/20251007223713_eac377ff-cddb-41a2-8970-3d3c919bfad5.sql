-- Drop the overly restrictive policy
DROP POLICY IF EXISTS "Users can create their initial role" ON public.user_roles;

-- Create a simpler policy that allows users to insert their own roles
CREATE POLICY "Users can insert own roles"
ON public.user_roles
FOR INSERT
WITH CHECK (auth.uid() = user_id);