CREATE OR REPLACE VIEW public.invoice_subtotal_reconciliation
WITH (security_invoker = true) AS
WITH child_expected AS (
  SELECT i.id AS invoice_id,
    COALESCE(SUM(ia.quantity_allocated::numeric * oi.unit_price), 0) AS expected_subtotal
  FROM invoices i
  JOIN inventory_allocations ia ON ia.invoice_id = i.id
  JOIN order_items oi ON oi.id = ia.order_item_id
  WHERE i.parent_invoice_id IS NOT NULL AND i.deleted_at IS NULL
  GROUP BY i.id
),
blanket_has_children AS (
  SELECT parent_invoice_id AS invoice_id, COUNT(*) AS n
  FROM invoices
  WHERE parent_invoice_id IS NOT NULL AND deleted_at IS NULL
  GROUP BY parent_invoice_id
),
blanket_expected AS (
  SELECT i.id AS invoice_id,
    CASE
      -- Has active children: blanket is frozen; do not flag drift here
      WHEN bhc.n IS NOT NULL THEN i.subtotal
      ELSE COALESCE((
        SELECT SUM(
          CASE
            WHEN oi.shipped_quantity IS NULL THEN oi.quantity::numeric * oi.unit_price
            ELSE oi.shipped_quantity::numeric * oi.unit_price
          END
        )
        FROM order_items oi
        WHERE oi.order_id = i.order_id
      ), 0)
    END AS expected_subtotal
  FROM invoices i
  LEFT JOIN blanket_has_children bhc ON bhc.invoice_id = i.id
  WHERE i.parent_invoice_id IS NULL
    AND (i.invoice_type = 'full' OR i.invoice_type IS NULL)
    AND i.deleted_at IS NULL
)
SELECT i.id AS invoice_id,
  i.invoice_number,
  i.order_id,
  i.company_id,
  CASE WHEN i.parent_invoice_id IS NULL THEN 'blanket' ELSE 'child' END AS invoice_kind,
  i.status,
  i.subtotal AS stored_subtotal,
  COALESCE(ce.expected_subtotal, be.expected_subtotal) AS expected_subtotal,
  i.subtotal - COALESCE(ce.expected_subtotal, be.expected_subtotal) AS drift
FROM invoices i
LEFT JOIN child_expected ce ON ce.invoice_id = i.id
LEFT JOIN blanket_expected be ON be.invoice_id = i.id
WHERE i.deleted_at IS NULL
  AND COALESCE(ce.expected_subtotal, be.expected_subtotal) IS NOT NULL
  AND ABS(i.subtotal - COALESCE(ce.expected_subtotal, be.expected_subtotal)) > 0.01;

GRANT SELECT ON public.invoice_subtotal_reconciliation TO authenticated;