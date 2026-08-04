-- Finalizing a blanket had two mechanisms that disagreed.
--
--   "Update Blanket" (client)  = SUM(shipped x price) + tax + SUM(children's shipping)
--   "Close Invoice"  (trigger) = SUM(COALESCE(shipped, ORDERED) x price) + tax + blanket's own shipping
--
-- The trigger billed lines that never shipped at their ORDERED quantity. Live: 10704 sits closed
-- at 40,739.70 but closing it under the old rule computed 67,739.70, and 10951 would have jumped
-- from 15,195 to 64,995. Same "NULL means nobody recorded it" mistake as the vendor PO totals,
-- except here it inflates a customer invoice.
--
-- There is now one formula, owned here, matching what Update Blanket always intended:
--   finalized blanket = SUM(shipped x price) + tax + freight
-- Freight comes from the child invoices when there are children, because a shipment's freight is
-- billed on the shipment, not on the blanket. Falls back to the blanket's own shipping_cost when
-- there are no children.
--
-- Open blankets are unchanged: SUM(GREATEST(ordered, shipped) x price), so the blanket holds
-- steady as a placeholder while children bill against it, and still grows for overs.

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

  UPDATE invoices i
  SET subtotal = CASE WHEN i.blanket_closed_at IS NULL THEN v_open_sub ELSE v_closed_sub END,
      shipping_cost = CASE
        WHEN i.blanket_closed_at IS NULL THEN i.shipping_cost
        ELSE COALESCE(
          (SELECT NULLIF(SUM(COALESCE(c.shipping_cost, 0)), 0)
             FROM invoices c
            WHERE c.parent_invoice_id = i.id
              AND c.deleted_at IS NULL),
          i.shipping_cost,
          0)
      END,
      total = (CASE WHEN i.blanket_closed_at IS NULL THEN v_open_sub ELSE v_closed_sub END)
              + COALESCE(i.tax, 0)
              + CASE
                  WHEN i.blanket_closed_at IS NULL THEN COALESCE(i.shipping_cost, 0)
                  ELSE COALESCE(
                    (SELECT NULLIF(SUM(COALESCE(c.shipping_cost, 0)), 0)
                       FROM invoices c
                      WHERE c.parent_invoice_id = i.id
                        AND c.deleted_at IS NULL),
                    i.shipping_cost,
                    0)
                END,
      updated_at = now()
  WHERE i.order_id = p_order_id
    AND (i.invoice_type = 'full' OR i.invoice_type IS NULL)
    AND i.parent_invoice_id IS NULL
    AND i.deleted_at IS NULL
    AND (p_include_closed OR i.blanket_closed_at IS NULL)
    AND (p_only_invoice_id IS NULL OR i.id = p_only_invoice_id)
    AND i.status IS DISTINCT FROM 'paid'
    AND i.quickbooks_sync_status IS DISTINCT FROM 'synced';
END;
$function$;
