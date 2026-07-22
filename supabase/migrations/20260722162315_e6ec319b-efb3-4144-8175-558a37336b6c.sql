-- Reconciliation view: shows any active invoice whose stored subtotal
-- drifts from its correct source-of-truth value.
CREATE OR REPLACE VIEW public.invoice_subtotal_reconciliation AS
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
    i.status,
    CASE
      WHEN i.status = 'closed' THEN
        COALESCE((
          SELECT SUM(COALESCE(oi.shipped_quantity, 0) * oi.unit_price)
          FROM public.order_items oi WHERE oi.order_id = i.order_id
        ), 0)
      ELSE
        COALESCE((
          SELECT SUM(oi.quantity * oi.unit_price)
          FROM public.order_items oi WHERE oi.order_id = i.order_id
        ), 0)
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
