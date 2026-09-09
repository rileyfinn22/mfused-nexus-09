-- The admin "subtotal drift" banner reads invoice_subtotal_reconciliation, and that view still
-- expected an open blanket to equal its ORDERED total (unless it happened to equal shipped-only).
-- Since 20260909150000 an open blanket with no shipment invoices bills what shipped, so the
-- moment 10989 was corrected to 5,918.10 the banner flagged it as 1,512 of drift against the
-- 7,430.10 it had just stopped billing. The view now applies the same rule as the trigger:
--
--   child                    -> Σ(allocation qty × unit_price)
--   blanket with children    -> not checked (it is an umbrella; the children are the invoices)
--   blanket, finalised       -> Σ(shipped × unit_price)
--   blanket, open, no children -> shipped where recorded; ordered where not; a recorded 0 is
--                               zero once anything on the order has shipped, else "not recorded"

CREATE OR REPLACE VIEW public.invoice_subtotal_reconciliation AS
WITH child_expected AS (
  SELECT i_1.id AS invoice_id,
         COALESCE(SUM(ia.quantity_allocated::numeric * oi.unit_price), 0::numeric) AS expected_subtotal
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
), order_shipping AS (
  SELECT order_id, bool_or(COALESCE(shipped_quantity, 0) > 0) AS any_shipped
    FROM order_items
   GROUP BY order_id
), blanket_totals AS (
  SELECT oi.order_id,
         SUM(COALESCE(oi.shipped_quantity, 0)::numeric * oi.unit_price) AS shipped_only_total,
         SUM((CASE
                WHEN oi.shipped_quantity IS NULL THEN oi.quantity
                WHEN oi.shipped_quantity = 0 AND NOT os.any_shipped THEN oi.quantity
                ELSE oi.shipped_quantity
              END)::numeric * oi.unit_price) AS open_total
    FROM order_items oi
    JOIN order_shipping os ON os.order_id = oi.order_id
   GROUP BY oi.order_id
), blanket_expected AS (
  SELECT i_1.id AS invoice_id,
         CASE
           WHEN bhc.n IS NOT NULL THEN i_1.subtotal
           WHEN i_1.blanket_closed_at IS NOT NULL OR i_1.status = 'closed'::text
             THEN COALESCE(bt.shipped_only_total, 0::numeric)
           ELSE COALESCE(bt.open_total, i_1.subtotal)
         END AS expected_subtotal
    FROM invoices i_1
    LEFT JOIN blanket_has_children bhc ON bhc.invoice_id = i_1.id
    LEFT JOIN blanket_totals bt ON bt.order_id = i_1.order_id
   WHERE i_1.parent_invoice_id IS NULL
     AND (i_1.invoice_type = 'full'::text OR i_1.invoice_type IS NULL)
     AND i_1.deleted_at IS NULL
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
   AND COALESCE(i.notes, ''::text) !~* '\[WRITE-OFF'::text
   AND COALESCE(i.notes, ''::text) !~* '\[RECONCILED'::text
   -- Paid blankets that would only GROW (overs recorded after payment) were deliberately parked
   -- off-screen on 2026-08-05 ("remove these drifts from screen, we can go back later"); 10708
   -- is the biggest. They stay off the banner. A paid blanket billing MORE than shipped still shows.
   AND NOT (i.parent_invoice_id IS NULL AND i.status = 'paid'::text
            AND i.subtotal < COALESCE(ce.expected_subtotal, be.expected_subtotal));

-- Keep RLS applying to whoever reads the view (it was created this way; restated so a
-- CREATE OR REPLACE can never silently drop it).
ALTER VIEW public.invoice_subtotal_reconciliation SET (security_invoker = true);
