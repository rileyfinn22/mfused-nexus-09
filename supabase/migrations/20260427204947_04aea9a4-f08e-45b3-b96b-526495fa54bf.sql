ALTER TABLE public._blanket_backfill_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vibe admins can view backfill audit"
ON public._blanket_backfill_audit
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'vibe_admin'));