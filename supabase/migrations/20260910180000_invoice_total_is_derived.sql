-- invoices.total is subtotal + tax + shipping_cost. Every writer knew that, and one of them still
-- managed to leave it stale: on 11053 the admin added 11,200 of freight on the invoice page, the
-- page wrote shipping_cost and then asked recalc_blanket_invoices_for_order to settle the total,
-- but the recalc's change guard compares subtotal and shipping_cost only -- both already matched
-- what it was about to write -- so it did nothing and total stayed at the goods-only 8,362. The
-- page displays subtotal + shipping live, so it looked right on screen and wrong everywhere the
-- stored total is read (PDF, statement, QuickBooks, receivables).
--
-- So the column is now derived, the same way order_items.total and vendor_po_items.total were
-- made derived on 2026-08-19: a BEFORE trigger sets it from its parts on every insert and every
-- change to any part. A writer can no longer produce a total that disagrees with its own row.
-- When the money moves on an invoice that is already in QuickBooks, the same trigger flips
-- quickbooks_sync_status to 'pending' so the change is visible and gets re-pushed, instead of
-- the two copies quietly diverging.

CREATE OR REPLACE FUNCTION public.set_invoice_total()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_new_total numeric;
BEGIN
  v_new_total := COALESCE(NEW.subtotal, 0) + COALESCE(NEW.tax, 0) + COALESCE(NEW.shipping_cost, 0);

  IF TG_OP = 'UPDATE'
     AND NEW.quickbooks_id IS NOT NULL
     AND (
       COALESCE(NEW.subtotal, 0)      IS DISTINCT FROM COALESCE(OLD.subtotal, 0)
       OR COALESCE(NEW.tax, 0)        IS DISTINCT FROM COALESCE(OLD.tax, 0)
       OR COALESCE(NEW.shipping_cost, 0) IS DISTINCT FROM COALESCE(OLD.shipping_cost, 0)
     )
     -- A sync in flight writes its own status; don't stomp it.
     AND NEW.quickbooks_sync_status IS NOT DISTINCT FROM OLD.quickbooks_sync_status
  THEN
    NEW.quickbooks_sync_status := 'pending';
  END IF;

  NEW.total := v_new_total;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_set_invoice_total ON public.invoices;
CREATE TRIGGER trg_set_invoice_total
  BEFORE INSERT OR UPDATE OF subtotal, tax, shipping_cost ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.set_invoice_total();

-- The recalc's own change guard now also fires when the stored total is off, so an explicit
-- call on an invoice whose parts already match still repairs it.
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
      OR COALESCE(i.shipping_cost, 0) IS DISTINCT FROM calc.new_ship
      OR COALESCE(i.total, 0) IS DISTINCT FROM calc.new_sub + COALESCE(i.tax, 0) + calc.new_ship)
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

-- Backfill: every live invoice whose stored total disagrees with its parts. Touching
-- shipping_cost (a no-op write) runs the new trigger, which also flips synced rows to pending.
UPDATE invoices
   SET shipping_cost = shipping_cost
 WHERE deleted_at IS NULL
   AND abs(COALESCE(subtotal, 0) + COALESCE(tax, 0) + COALESCE(shipping_cost, 0) - COALESCE(total, 0)) > 0.005;
