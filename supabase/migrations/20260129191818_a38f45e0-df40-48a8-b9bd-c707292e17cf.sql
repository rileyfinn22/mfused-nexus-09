-- Add policies for vibe_admins to manage user_roles across all companies

-- Allow vibe_admins to view all user roles
CREATE POLICY "Vibe admins can view all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'vibe_admin'));

-- Allow vibe_admins to insert roles for any company
CREATE POLICY "Vibe admins can insert any roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'vibe_admin'));

-- Allow vibe_admins to delete roles for any company
CREATE POLICY "Vibe admins can delete any roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'vibe_admin'));