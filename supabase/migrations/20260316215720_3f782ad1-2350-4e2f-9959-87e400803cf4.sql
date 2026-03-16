
CREATE TABLE public.financed_invoice_edit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  financed_invoice_id uuid NOT NULL REFERENCES public.financed_invoices(id) ON DELETE CASCADE,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changes jsonb NOT NULL DEFAULT '{}'
);

ALTER TABLE public.financed_invoice_edit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vibe admins and finance can view edit logs"
  ON public.financed_invoice_edit_log
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'vibe_admin') OR has_role(auth.uid(), 'finance')
  );

CREATE POLICY "Vibe admins and finance can insert edit logs"
  ON public.financed_invoice_edit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'vibe_admin') OR has_role(auth.uid(), 'finance')
  );
