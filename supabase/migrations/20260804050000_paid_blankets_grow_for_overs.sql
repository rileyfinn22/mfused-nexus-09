-- Overs shipped after an invoice was paid were lost. The recalc skipped anything already paid,
-- so the real-world sequence -- customer pays, final shipment goes out with overs -- could never
-- reach the invoice. That is the whole of the 6,006.45 sitting unbilled across 13 orders today,
-- 3,052 of it on 10708 alone.
--
-- A paid invoice may now GROW when more shipped than was billed. It may never shrink on its own:
-- reducing something a customer has paid is refund territory and stays a human decision. So an
-- automatic recalc can only ever surface money owed, never quietly write money off.
--
-- An explicit action on one invoice (Finalise Blanket passes p_only_invoice_id) is still allowed
-- to move it in either direction -- that IS the human decision.
--
-- Growing past what has been paid also puts the status back to 'open', matching what
-- update_invoice_payment_status would say, so a part-paid invoice does not sit there labelled
-- 'paid' with a balance due underneath it.

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
  v_open_sub   numeric;
  v_closed_sub numeric;
BEGIN
  SELECT
    -- Open: never shrinks mid-drawdown, still grows for overs.
    COALESCE(SUM(GREATEST(quantity, COALESCE(shipped_quantity, 0)) * unit_price), 0),
    -- Finalized: only what actually shipped. A line nobody ever shipped bills zero.
    COALESCE(SUM(COALESCE(shipped_quantity, 0) * unit_price), 0)
  INTO v_open_sub, v_closed_sub
  FROM order_items
  WHERE order_id = p_order_id;

  WITH calc AS (
    SELECT
      i.id,
      CASE WHEN i.blanket_closed_at IS NULL THEN v_open_sub ELSE v_closed_sub END AS new_sub,
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
      -- Nothing paid yet: free to move.
      OR COALESCE(i.total_paid, 0) <= 0.005
      -- Money has changed hands: automatic recalcs may only ever increase it.
      OR calc.new_sub > i.subtotal + 0.01
    );
END;
$function$;
