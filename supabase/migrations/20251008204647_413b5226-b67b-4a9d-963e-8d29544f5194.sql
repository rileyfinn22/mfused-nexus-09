-- Add policy for vibe_admin to create vendors
CREATE POLICY "Vibe admins can create vendors"
  ON public.vendors FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'vibe_admin'::app_role));