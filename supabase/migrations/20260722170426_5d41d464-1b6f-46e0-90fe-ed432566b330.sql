CREATE OR REPLACE VIEW public.invoice_subtotal_reconciliation AS
WITH child_expected AS (
  SELECT i_1.id AS invoice_id,
    COALESCE(sum(ia.quantity_allocated::numeric * oi.unit_price), 0::numeric) AS expected_subtotal
  FROM invoices i_1
    JOIN inventory_allocations ia ON ia.invoice_id = i_1.id
    JOIN order_items oi ON oi.id = ia.order_item_id
  WHERE i_1.parent_invoice_id IS NOT NULL AND i_1.deleted_at IS NULL
  GROUP BY i_1.id
), blanket_has_children AS (
  SELECT invoices.parent_invoice_id AS invoice_id, count(*) AS n
  FROM invoices
  WHERE invoices.parent_invoice_id IS NOT NULL AND invoices.deleted_at IS NULL
  GROUP BY invoices.parent_invoice_id
), blanket_expected AS (
  SELECT i_1.id AS invoice_id,
    CASE
      WHEN bhc.n IS NOT NULL THEN i_1.subtotal
      ELSE COALESCE((SELECT sum(
        CASE WHEN oi.shipped_quantity IS NULL THEN oi.quantity::numeric * oi.unit_price
             ELSE oi.shipped_quantity::numeric * oi.unit_price END)
        FROM order_items oi WHERE oi.order_id = i_1.order_id), 0::numeric)
    END AS expected_subtotal
  FROM invoices i_1
    LEFT JOIN blanket_has_children bhc ON bhc.invoice_id = i_1.id
  WHERE i_1.parent_invoice_id IS NULL AND (i_1.invoice_type = 'full'::text OR i_1.invoice_type IS NULL) AND i_1.deleted_at IS NULL
)
SELECT i.id AS invoice_id,
  i.invoice_number,
  i.order_id,
  i.company_id,
  CASE WHEN i.parent_invoice_id IS NULL THEN 'blanket'::text ELSE 'child'::text END AS invoice_kind,
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