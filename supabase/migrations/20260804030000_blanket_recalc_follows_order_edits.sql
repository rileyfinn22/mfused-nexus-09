-- A blanket stopped tracking its order the moment it synced to QuickBooks.
--
-- recalc_blanket_invoices_for_order skipped any invoice with quickbooks_sync_status = 'synced'.
-- The intent was right -- an invoice already in the customer's books should not silently
-- restate itself -- but it also meant that deliberately editing the order behind it did
-- nothing, with no warning anywhere. 11025 is what that looks like: created 22 Jul at 4,150,
-- tracked down to 3,368 while still unsynced, frozen there when it synced, and left behind when
-- the line items were replaced on 4 Aug and the order became 3,963. The QuickBooks sync then
-- saw invoice < order, inferred a percentage from the gap, and billed that instead of the
-- deposit the user had set.
--
-- So: keep following the order, but never do it silently. A synced invoice whose numbers
-- actually move is flagged back to 'pending', which is visible in the app and gets it re-pushed
-- rather than quietly diverging from QuickBooks.
--
-- PAID invoices are still left alone. Restating what somebody has already paid is a different
-- thing entirely and is not something a trigger should decide.

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
      AND i.status IS DISTINCT FROM 'paid'
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
      updated_at = now()
  FROM calc
  WHERE i.id = calc.id
    AND (i.subtotal IS DISTINCT FROM calc.new_sub
      OR COALESCE(i.shipping_cost, 0) IS DISTINCT FROM calc.new_ship);
END;
$function$;
