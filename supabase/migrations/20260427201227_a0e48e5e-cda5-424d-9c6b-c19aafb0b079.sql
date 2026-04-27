CREATE OR REPLACE FUNCTION public.recalculate_order_totals()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order_id uuid;
  v_new_subtotal numeric;
  v_shipped_only_subtotal numeric;
  v_effective_subtotal numeric;
  v_blanket_subtotal numeric;
  v_any_shipped boolean;
  v_has_children boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_order_id := OLD.order_id;
  ELSE
    v_order_id := NEW.order_id;
  END IF;

  -- Ordered subtotal (for the order record itself)
  SELECT COALESCE(SUM(quantity * unit_price), 0)
  INTO v_new_subtotal
  FROM order_items
  WHERE order_id = v_order_id;

  -- Per-line effective subtotal: max(ordered, shipped) per item * unit_price
  -- This correctly handles mixed over/under shipped lines.
  SELECT COALESCE(SUM(GREATEST(quantity, COALESCE(shipped_quantity, 0)) * unit_price), 0)
  INTO v_effective_subtotal
  FROM order_items
  WHERE order_id = v_order_id;

  -- Shipped-only subtotal (only items with shipped_quantity > 0)
  SELECT COALESCE(SUM(shipped_quantity * unit_price), 0)
  INTO v_shipped_only_subtotal
  FROM order_items
  WHERE order_id = v_order_id AND shipped_quantity > 0;

  SELECT EXISTS(
    SELECT 1 FROM order_items
    WHERE order_id = v_order_id AND shipped_quantity > 0
  ) INTO v_any_shipped;

  SELECT EXISTS(
    SELECT 1 FROM invoices parent
    JOIN invoices child ON child.parent_invoice_id = parent.id AND child.deleted_at IS NULL
    WHERE parent.order_id = v_order_id
      AND (parent.invoice_type = 'full' OR parent.invoice_type IS NULL)
      AND parent.deleted_at IS NULL
  ) INTO v_has_children;

  -- Blanket subtotal logic:
  -- Has children → per-line effective (max of ordered vs shipped per line)
  -- No children, any shipped → shipped-only
  -- No children, nothing shipped → ordered placeholder
  IF v_has_children THEN
    v_blanket_subtotal := v_effective_subtotal;
  ELSIF v_any_shipped THEN
    v_blanket_subtotal := v_shipped_only_subtotal;
  ELSE
    v_blanket_subtotal := v_new_subtotal;
  END IF;

  UPDATE orders
  SET subtotal = v_new_subtotal,
      total = v_new_subtotal + COALESCE(tax, 0) + COALESCE(shipping_cost, 0),
      updated_at = now()
  WHERE id = v_order_id;

  UPDATE invoices
  SET subtotal = v_blanket_subtotal,
      total = v_blanket_subtotal + COALESCE(tax, 0) + COALESCE(shipping_cost, 0),
      updated_at = now()
  WHERE order_id = v_order_id
    AND (invoice_type = 'full' OR invoice_type IS NULL)
    AND quickbooks_sync_status IS DISTINCT FROM 'synced'
    AND deleted_at IS NULL;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Backfill: recalculate the 7 affected YTD blanket invoices using per-line effective math
WITH effective AS (
  SELECT 
    i.id AS invoice_id,
    COALESCE(SUM(GREATEST(oi.quantity, COALESCE(oi.shipped_quantity, 0)) * oi.unit_price), 0) AS eff_subtotal,
    COALESCE(i.tax, 0) AS tax,
    COALESCE(i.shipping_cost, 0) AS shipping
  FROM invoices i
  JOIN order_items oi ON oi.order_id = i.order_id
  WHERE i.deleted_at IS NULL
    AND (i.invoice_type = 'full' OR i.invoice_type IS NULL)
    AND i.quickbooks_sync_status IS DISTINCT FROM 'synced'
  GROUP BY i.id, i.tax, i.shipping_cost
)
UPDATE invoices inv
SET subtotal = e.eff_subtotal,
    total = e.eff_subtotal + e.tax + e.shipping,
    updated_at = now()
FROM effective e
WHERE inv.id = e.invoice_id
  AND ROUND(inv.subtotal::numeric, 2) <> ROUND(e.eff_subtotal::numeric, 2);