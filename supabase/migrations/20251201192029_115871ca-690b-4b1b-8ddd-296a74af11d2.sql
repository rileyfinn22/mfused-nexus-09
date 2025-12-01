-- Add soft delete column to invoices
ALTER TABLE invoices ADD COLUMN deleted_at timestamp with time zone;

-- Create invoice audit log table
CREATE TABLE invoice_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  action text NOT NULL, -- 'created', 'updated', 'deleted', 'restored', 'payment_added'
  changed_by uuid REFERENCES auth.users(id),
  changed_at timestamp with time zone NOT NULL DEFAULT now(),
  changes jsonb, -- stores before/after values
  notes text
);

-- Enable RLS on audit log
ALTER TABLE invoice_audit_log ENABLE ROW LEVEL SECURITY;

-- RLS policies for audit log
CREATE POLICY "Vibe admins can view all audit logs"
  ON invoice_audit_log FOR SELECT
  USING (has_role(auth.uid(), 'vibe_admin'));

CREATE POLICY "Admins can view company audit logs"
  ON invoice_audit_log FOR SELECT
  USING (
    has_role(auth.uid(), 'admin') AND
    EXISTS (
      SELECT 1 FROM invoices 
      WHERE invoices.id = invoice_audit_log.invoice_id 
      AND invoices.company_id = get_user_company(auth.uid())
    )
  );

CREATE POLICY "System can insert audit logs"
  ON invoice_audit_log FOR INSERT
  WITH CHECK (true);

-- Create trigger function to log invoice changes
CREATE OR REPLACE FUNCTION log_invoice_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO invoice_audit_log (invoice_id, action, changed_by, changes)
    VALUES (OLD.id, 'deleted', auth.uid(), to_jsonb(OLD));
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Only log if deleted_at changed
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      INSERT INTO invoice_audit_log (invoice_id, action, changed_by, changes)
      VALUES (NEW.id, 'deleted', auth.uid(), jsonb_build_object('deleted_at', NEW.deleted_at));
    ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
      INSERT INTO invoice_audit_log (invoice_id, action, changed_by, changes)
      VALUES (NEW.id, 'restored', auth.uid(), jsonb_build_object('restored_at', now()));
    ELSE
      INSERT INTO invoice_audit_log (invoice_id, action, changed_by, changes)
      VALUES (NEW.id, 'updated', auth.uid(), jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW)));
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO invoice_audit_log (invoice_id, action, changed_by, changes)
    VALUES (NEW.id, 'created', auth.uid(), to_jsonb(NEW));
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger
CREATE TRIGGER invoice_audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION log_invoice_changes();

-- Create index for better performance
CREATE INDEX idx_invoice_audit_log_invoice_id ON invoice_audit_log(invoice_id);
CREATE INDEX idx_invoice_audit_log_changed_at ON invoice_audit_log(changed_at DESC);
CREATE INDEX idx_invoices_deleted_at ON invoices(deleted_at);