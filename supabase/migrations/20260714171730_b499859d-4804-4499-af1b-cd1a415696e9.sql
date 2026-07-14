CREATE OR REPLACE FUNCTION public.recalculate_order_totals()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_order_id uuid;
  v_ordered_subtotal numeric;
  v_per_line_effective numeric;
  v_blanket_subtotal numeric;
  v_has_children boolean;
  v_blanket_closed boolean;
  v_children_total numeric;
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

  -- Per-line effective: NULL shipped → ordered placeholder; set (incl 0) → shipped × price
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

  SELECT COALESCE(BOOL_OR(blanket_closed_at IS NOT NULL), false)
  INTO v_blanket_closed
  FROM invoices
  WHERE order_id = v_order_id
    AND (invoice_type = 'full' OR invoice_type IS NULL)
    AND deleted_at IS NULL;

  UPDATE orders
  SET subtotal = v_ordered_subtotal,
      total = v_ordered_subtotal + COALESCE(tax, 0) + COALESCE(shipping_cost, 0),
      updated_at = now()
  WHERE id = v_order_id;

  IF v_has_children AND v_blanket_closed THEN
    SELECT COALESCE(SUM(child.subtotal), 0)
    INTO v_children_total
    FROM invoices parent
    JOIN invoices child ON child.parent_invoice_id = parent.id AND child.deleted_at IS NULL
    WHERE parent.order_id = v_order_id
      AND (parent.invoice_type = 'full' OR parent.invoice_type IS NULL)
      AND parent.deleted_at IS NULL;

    v_blanket_subtotal := v_children_total;
  ELSE
    -- Live/open blanket (with or without children): reflect shipped × price
    v_blanket_subtotal := v_per_line_effective;
  END IF;

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

-- Fix invoice 10994 now
UPDATE public.invoices
SET subtotal = 12525,
    total = 12525 + COALESCE(tax, 0) + COALESCE(shipping_cost, 0),
    updated_at = now()
WHERE id = '753dd33d-c5bb-45d0-b04c-475f87d819bb';