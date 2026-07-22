-- Recreate reconciliation view with security_invoker so RLS is enforced per caller
DROP VIEW IF EXISTS public.invoice_subtotal_reconciliation;

CREATE VIEW public.invoice_subtotal_reconciliation
WITH (security_invoker = true) AS
WITH child_expected AS (
  SELECT
    i.id AS invoice_id,
    COALESCE(SUM(ia.quantity_allocated * oi.unit_price), 0)::numeric AS expected_subtotal
  FROM public.invoices i
  JOIN public.inventory_allocations ia ON ia.invoice_id = i.id
  JOIN public.order_items oi ON oi.id = ia.order_item_id
  WHERE i.parent_invoice_id IS NOT NULL
    AND i.deleted_at IS NULL
  GROUP BY i.id
),
blanket_expected AS (
  SELECT
    i.id AS invoice_id,
    CASE
      WHEN i.status = 'closed' THEN
        COALESCE((SELECT SUM(COALESCE(oi.shipped_quantity, 0) * oi.unit_price)
                  FROM public.order_items oi WHERE oi.order_id = i.order_id), 0)
      ELSE
        COALESCE((SELECT SUM(oi.quantity * oi.unit_price)
                  FROM public.order_items oi WHERE oi.order_id = i.order_id), 0)
    END::numeric AS expected_subtotal
  FROM public.invoices i
  WHERE i.parent_invoice_id IS NULL
    AND (i.invoice_type = 'full' OR i.invoice_type IS NULL)
    AND i.deleted_at IS NULL
)
SELECT
  i.id AS invoice_id,
  i.invoice_number,
  i.order_id,
  i.company_id,
  CASE WHEN i.parent_invoice_id IS NULL THEN 'blanket' ELSE 'child' END AS invoice_kind,
  i.status,
  i.subtotal AS stored_subtotal,
  COALESCE(ce.expected_subtotal, be.expected_subtotal) AS expected_subtotal,
  (i.subtotal - COALESCE(ce.expected_subtotal, be.expected_subtotal))::numeric AS drift
FROM public.invoices i
LEFT JOIN child_expected ce ON ce.invoice_id = i.id
LEFT JOIN blanket_expected be ON be.invoice_id = i.id
WHERE i.deleted_at IS NULL
  AND COALESCE(ce.expected_subtotal, be.expected_subtotal) IS NOT NULL
  AND ABS(i.subtotal - COALESCE(ce.expected_subtotal, be.expected_subtotal)) > 0.01;

GRANT SELECT ON public.invoice_subtotal_reconciliation TO authenticated;
GRANT SELECT ON public.invoice_subtotal_reconciliation TO service_role;

-- Validation trigger: child invoice subtotal must equal Σ(allocations × unit_price)
CREATE OR REPLACE FUNCTION public.validate_child_invoice_subtotal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expected numeric;
  v_alloc_count integer;
BEGIN
  -- Only validate child shipment invoices that are active
  IF NEW.parent_invoice_id IS NULL OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(ia.quantity_allocated * oi.unit_price), 0), COUNT(*)
  INTO v_expected, v_alloc_count
  FROM public.inventory_allocations ia
  JOIN public.order_items oi ON oi.id = ia.order_item_id
  WHERE ia.invoice_id = NEW.id;

  -- Skip validation before allocations exist (INSERT happens before allocations are written)
  IF v_alloc_count = 0 THEN
    RETURN NEW;
  END IF;

  IF ABS(COALESCE(NEW.subtotal, 0) - v_expected) > 0.01 THEN
    RAISE EXCEPTION 'Child invoice % subtotal (%) does not match allocation total (%). Subtotal must equal sum of allocations × unit_price.',
      NEW.invoice_number, NEW.subtotal, v_expected
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.validate_child_invoice_subtotal() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_validate_child_invoice_subtotal ON public.invoices;
CREATE TRIGGER trg_validate_child_invoice_subtotal
  BEFORE INSERT OR UPDATE OF subtotal, parent_invoice_id ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_child_invoice_subtotal();
