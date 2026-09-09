-- A blanket invoice with no shipment invoices under it IS the invoice. When a shipped quantity
-- is recorded on it, that is what the customer is billed for -- not the ordered quantity held
-- until somebody presses Finalise.
--
-- The open-blanket rule was per-line GREATEST(ordered, shipped): it grew for overs but never
-- shrank for a short shipment, and once any payment sat on the invoice an automatic recalc was
-- only allowed to increase it. 10989 showed what that does in practice: 22,800 of 30,000 bags
-- shipped and were Quick Shipped on 22 Jul (invoice 5,568, QuickBooks 5,568). Two lines were
-- added to the order on 28 Jul, a since-deleted client writer restated the blanket to the full
-- ordered 7,430.10, and from then on the trigger computed the same number and the paid-guard
-- refused to let it come back down. The customer's deposit of 3,540 was being deducted from
-- goods that never shipped. 10900 sat the same way: 1,300 of goods shipped and paid in full,
-- restated to the ordered 4,050 by a 22 Jul backfill, showing 2,750 due for nothing.
--
-- The rule now, in one place:
--   * blanket WITH shipment invoices  -> unchanged. It is the umbrella the children draw down
--                                        against and must not shrink: GREATEST(ordered, shipped).
--   * blanket WITHOUT children, open  -> a line bills what shipped. A line nobody has recorded
--                                        yet (NULL) bills as ordered -- it is still the order.
--                                        A recorded 0 bills zero once anything on the order has
--                                        shipped; before that it also counts as "not recorded",
--                                        because new orders are seeded with zeros (analyze-po),
--                                        and 11013 has eight of them with nothing shipped.
--   * finalised                        -> only what shipped, as before.
--
-- The guard changes with it: an invoice that is not fully paid may move either way (a deposit
-- must not freeze the goods total above what shipped). A fully paid invoice still only grows on
-- its own -- shrinking something the customer has settled is refund territory and stays a
-- human action (Finalise / an explicit edit pass p_only_invoice_id, which may move it either way).

CREATE OR REPLACE FUNCTION public.recalc_blanket_invoices_for_order(
  p_order_id uuid,
  p_include_closed boolean DEFAULT false,
  p_only_invoice_id uuid DEFAULT NULL::uuid
)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_any_shipped  boolean;
  v_umbrella_sub numeric;  -- blanket with children: per-line GREATEST(ordered, shipped)
  v_shipped_sub  numeric;  -- blanket that is the invoice: what shipped, ordered where not recorded
  v_closed_sub   numeric;  -- finalised: only what shipped
BEGIN
  SELECT COALESCE(bool_or(COALESCE(shipped_quantity, 0) > 0), false)
  INTO v_any_shipped
  FROM order_items
  WHERE order_id = p_order_id;

  SELECT
    COALESCE(SUM(GREATEST(quantity, COALESCE(shipped_quantity, 0)) * unit_price), 0),
    COALESCE(SUM(
      CASE
        WHEN shipped_quantity IS NULL THEN quantity
        WHEN shipped_quantity = 0 AND NOT v_any_shipped THEN quantity
        ELSE shipped_quantity
      END * unit_price), 0),
    COALESCE(SUM(COALESCE(shipped_quantity, 0) * unit_price), 0)
  INTO v_umbrella_sub, v_shipped_sub, v_closed_sub
  FROM order_items
  WHERE order_id = p_order_id;

  WITH calc AS (
    SELECT
      i.id,
      CASE
        WHEN i.blanket_closed_at IS NOT NULL THEN v_closed_sub
        WHEN EXISTS (
          SELECT 1 FROM invoices c
           WHERE c.parent_invoice_id = i.id AND c.deleted_at IS NULL
        ) THEN v_umbrella_sub
        ELSE v_shipped_sub
      END AS new_sub,
      CASE
        WHEN i.blanket_closed_at IS NULL THEN COALESCE(i.shipping_cost, 0)
        ELSE COALESCE(
          (SELECT NULLIF(SUM(COALESCE(c.shipping_cost, 0)), 0)
             FROM invoices c
            WHERE c.parent_invoice_id = i.id
              AND c.deleted_at IS NULL),
          i.shipping_cost,
          0)
      END AS new_ship
    FROM invoices i
    WHERE i.order_id = p_order_id
      AND (i.invoice_type = 'full' OR i.invoice_type IS NULL)
      AND i.parent_invoice_id IS NULL
      AND i.deleted_at IS NULL
      AND (p_include_closed OR i.blanket_closed_at IS NULL)
      AND (p_only_invoice_id IS NULL OR i.id = p_only_invoice_id)
  )
  UPDATE invoices i
  SET subtotal = calc.new_sub,
      shipping_cost = calc.new_ship,
      total = calc.new_sub + COALESCE(i.tax, 0) + calc.new_ship,
      -- Already in QuickBooks and the numbers moved? Say so instead of drifting apart.
      quickbooks_sync_status = CASE
        WHEN i.quickbooks_id IS NOT NULL THEN 'pending'
        ELSE i.quickbooks_sync_status
      END,
      -- Keep paid/open honest against the new total; leave billed/closed to their own workflow.
      status = CASE
        WHEN i.status IN ('paid', 'open') THEN
          CASE
            WHEN COALESCE(i.total_paid, 0) >= calc.new_sub + COALESCE(i.tax, 0) + calc.new_ship
              THEN 'paid'
            ELSE 'open'
          END
        ELSE i.status
      END,
      updated_at = now()
  FROM calc
  WHERE i.id = calc.id
    AND (i.subtotal IS DISTINCT FROM calc.new_sub
      OR COALESCE(i.shipping_cost, 0) IS DISTINCT FROM calc.new_ship)
    AND (
      -- An explicit action on one invoice may move it either way.
      p_only_invoice_id IS NOT NULL
      -- Not fully paid: free to move. A deposit is not a reason to keep billing unshipped goods.
      OR COALESCE(i.total_paid, 0) < COALESCE(i.total, 0) - 0.005
      -- Fully paid: automatic recalcs may only ever increase it.
      OR calc.new_sub > i.subtotal + 0.01
    );
END;
$function$;

-- Bring the two short-shipped blankets that are sitting wrong today into line. Only invoices
-- billing MORE than shipped are touched here; the growth cases (the paid blankets parked
-- off-screen on 2026-08-05, 10708 among them) are deliberately left where they are.
--
--   10989  7,430.10 -> 5,918.10  (22,800 bags shipped + plates + die, case line and freight
--                                 still as ordered; 3,540 deposit paid, 2,378.10 due)
--   10900  4,050.00 -> 1,300.00  (50,000 labels shipped and paid; the two tamper lines never
--                                 shipped; order completed -> paid in full)
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT i.order_id
      FROM invoices i
     WHERE i.invoice_number IN ('10989', '10900')
       AND i.deleted_at IS NULL
       AND i.parent_invoice_id IS NULL
  LOOP
    PERFORM public.recalc_blanket_invoices_for_order(r.order_id, false, NULL);
  END LOOP;
END $$;
