CREATE OR REPLACE VIEW public.invoice_receivables
WITH (security_invoker = true) AS
WITH kids AS (
  SELECT
    c.id,
    c.parent_invoice_id,
    COALESCE(SUM(GREATEST(c.total - c.total_paid, 0)) OVER (
      PARTITION BY c.parent_invoice_id
      ORDER BY c.invoice_number
      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
    ), 0) AS prior_outstanding,
    p.total_paid AS parent_paid
  FROM public.invoices c
  JOIN public.invoices p
    ON p.id = c.parent_invoice_id
   AND p.deleted_at IS NULL
  WHERE c.deleted_at IS NULL
),
has_kids AS (
  SELECT parent_invoice_id AS invoice_id
  FROM public.invoices
  WHERE parent_invoice_id IS NOT NULL AND deleted_at IS NULL
  GROUP BY parent_invoice_id
)
SELECT
  i.id                AS invoice_id,
  i.invoice_number,
  i.company_id,
  i.order_id,
  i.status,
  i.invoice_date,
  i.due_date,
  CASE WHEN i.parent_invoice_id IS NULL THEN 'blanket' ELSE 'child' END AS kind,
  (hk.invoice_id IS NOT NULL) AS is_placeholder,
  (hk.invoice_id IS NULL)     AS counts_toward_ar,
  i.total,
  i.total_paid,
  CASE WHEN hk.invoice_id IS NOT NULL THEN 0::numeric ELSE i.total END AS billable,
  CASE
    WHEN hk.invoice_id IS NOT NULL THEN 0::numeric
    ELSE ROUND(LEAST(
           GREATEST(COALESCE(k.parent_paid, 0) - COALESCE(k.prior_outstanding, 0), 0),
           GREATEST(i.total - i.total_paid, 0)
         )::numeric, 2)
  END AS parent_credit,
  CASE
    WHEN hk.invoice_id IS NOT NULL THEN 0::numeric
    ELSE ROUND(GREATEST(
           i.total - i.total_paid - LEAST(
             GREATEST(COALESCE(k.parent_paid, 0) - COALESCE(k.prior_outstanding, 0), 0),
             GREATEST(i.total - i.total_paid, 0)
           ), 0)::numeric, 2)
  END AS outstanding
FROM public.invoices i
LEFT JOIN has_kids hk ON hk.invoice_id = i.id
LEFT JOIN kids k      ON k.id = i.id
WHERE i.deleted_at IS NULL;

COMMENT ON VIEW public.invoice_receivables IS
'Receivables with the blanket/child rule applied exactly once. A blanket that has active shipment children is a placeholder for the order, not a receivable: it is flagged is_placeholder and contributes 0. Payments sitting on such a blanket (deposits, or a payment moved over from another invoice) are credited to its children earliest-first, never twice, matching computeChildCredit in src/lib/invoiceBalance.ts. SUM(outstanding) is the correct AR; summing invoices.total - total_paid directly double-counts every blanket that has children.';

GRANT SELECT ON public.invoice_receivables TO authenticated;
