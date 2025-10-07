-- Allow users to create their initial user_role during signup
-- This policy allows users to insert their own first role, but prevents adding more roles later
CREATE POLICY "Users can create their initial role"
ON public.user_roles
FOR INSERT
WITH CHECK (
  auth.uid() = user_id 
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
  )
);