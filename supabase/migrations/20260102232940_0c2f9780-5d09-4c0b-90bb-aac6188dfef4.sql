-- Drop the overly permissive policy that allows any authenticated user to insert audit logs
DROP POLICY IF EXISTS "System can insert audit logs" ON invoice_audit_log;

-- The SECURITY DEFINER trigger handles inserts, so we don't need a permissive INSERT policy
-- If needed for service role operations, this restrictive policy only allows service_role
CREATE POLICY "Only service role can insert audit logs"
  ON invoice_audit_log FOR INSERT
  WITH CHECK (auth.jwt()->>'role' = 'service_role');