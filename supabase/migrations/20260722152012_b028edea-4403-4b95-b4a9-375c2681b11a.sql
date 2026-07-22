CREATE OR REPLACE FUNCTION public.recalculate_order_totals()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order_id uuid;
  v_ordered_subtotal numeric;
  v_per_line_effective numeric;
  v_has_children boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_order_id := OLD.order_id;
  ELSE
    v_order_id := NEW.order_id;
  END IF;

  SELECT COALESCE(SUM(quantity * unit_price), 0)
  INTO v_ordered_subtotal
  FROM order_items
  WHERE order_id = v_order_id;

  SELECT COALESCE(SUM(
    CASE
      WHEN shipped_quantity IS NULL THEN quantity * unit_price
      ELSE shipped_quantity * unit_price
    END
  ), 0)
  INTO v_per_line_effective
  FROM order_items
  WHERE order_id = v_order_id;

  SELECT EXISTS(
    SELECT 1 FROM invoices parent
    JOIN invoices child ON child.parent_invoice_id = parent.id AND child.deleted_at IS NULL
    WHERE parent.order_id = v_order_id
      AND (parent.invoice_type = 'full' OR parent.invoice_type IS NULL)
      AND parent.deleted_at IS NULL
  ) INTO v_has_children;

  UPDATE orders
  SET subtotal = v_ordered_subtotal,
      total = v_ordered_subtotal + COALESCE(tax, 0) + COALESCE(shipping_cost, 0),
      updated_at = now()
  WHERE id = v_order_id;

  IF v_has_children THEN
    -- Blanket has children (open or closed): leave subtotal alone.
    -- Manual "Update Blanket" button is the authoritative recalc.
    NULL;
  ELSE
    -- No children: live per-line effective
    UPDATE invoices
    SET subtotal = v_per_line_effective,
        total = v_per_line_effective + COALESCE(tax, 0) + COALESCE(shipping_cost, 0),
        updated_at = now()
    WHERE order_id = v_order_id
      AND (invoice_type = 'full' OR invoice_type IS NULL)
      AND quickbooks_sync_status IS DISTINCT FROM 'synced'
      AND deleted_at IS NULL;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;