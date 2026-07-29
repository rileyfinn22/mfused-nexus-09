DROP VIEW IF EXISTS public.invoice_subtotal_reconciliation;

CREATE VIEW public.invoice_subtotal_reconciliation
WITH (security_invoker = true) AS
WITH child_expected AS (
  SELECT i.id AS invoice_id,
         COALESCE(sum(ia.quantity_allocated::numeric * oi.unit_price), 0::numeric) AS expected_subtotal
  FROM invoices i
  JOIN inventory_allocations ia ON ia.invoice_id = i.id
  JOIN order_items oi ON oi.id = ia.order_item_id
  WHERE i.parent_invoice_id IS NOT NULL AND i.deleted_at IS NULL
  GROUP BY i.id
), blanket_has_children AS (
  SELECT parent_invoice_id AS invoice_id, count(*) AS n
  FROM invoices
  WHERE parent_invoice_id IS NOT NULL AND deleted_at IS NULL
  GROUP BY parent_invoice_id
), blanket_totals AS (
  SELECT oi.order_id,
         sum(oi.quantity::numeric * oi.unit_price) AS ordered_total,
         sum(COALESCE(oi.shipped_quantity, 0)::numeric * oi.unit_price) AS shipped_only_total
  FROM order_items oi
  GROUP BY oi.order_id
), blanket_expected AS (
  SELECT i.id AS invoice_id,
         CASE
           -- children own the math
           WHEN bhc.n IS NOT NULL THEN i.subtotal
           -- closed blanket: final shipped quantities are authoritative
           WHEN (i.blanket_closed_at IS NOT NULL OR i.status = 'closed')
             THEN COALESCE(bt.shipped_only_total, 0::numeric)
           -- open blanket: valid if it matches EITHER the ordered total
           -- (still open, partial shipping is normal) OR the shipped total
           -- (already fully billed against shipments).
           WHEN abs(i.subtotal - COALESCE(bt.shipped_only_total, 0::numeric)) <= 0.01
             THEN i.subtotal
           ELSE COALESCE(bt.ordered_total, i.subtotal)
         END AS expected_subtotal
  FROM invoices i
  LEFT JOIN blanket_has_children bhc ON bhc.invoice_id = i.id
  LEFT JOIN blanket_totals bt ON bt.order_id = i.order_id
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
  AND abs(i.subtotal - COALESCE(ce.expected_subtotal, be.expected_subtotal)) > 0.01
  AND COALESCE(i.notes, '') !~* '\[WRITE-OFF'
  AND COALESCE(i.notes, '') !~* '\[RECONCILED';

GRANT SELECT ON public.invoice_subtotal_reconciliation TO authenticated;
GRANT SELECT ON public.invoice_subtotal_reconciliation TO service_role;