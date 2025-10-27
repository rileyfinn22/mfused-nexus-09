-- Allow vibe_admins to view and manage QuickBooks settings
CREATE POLICY "Vibe admins can view QuickBooks settings"
ON quickbooks_settings
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'vibe_admin'::app_role));

CREATE POLICY "Vibe admins can insert QuickBooks settings"
ON quickbooks_settings
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'vibe_admin'::app_role));

CREATE POLICY "Vibe admins can update QuickBooks settings"
ON quickbooks_settings
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'vibe_admin'::app_role));