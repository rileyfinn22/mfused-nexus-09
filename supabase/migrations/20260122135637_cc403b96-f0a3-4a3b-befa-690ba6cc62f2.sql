-- Add DELETE policy for vibe admins to delete production stage updates
CREATE POLICY "Vibe admins can delete updates" 
ON public.production_stage_updates 
FOR DELETE 
USING (has_role(auth.uid(), 'vibe_admin'::app_role));