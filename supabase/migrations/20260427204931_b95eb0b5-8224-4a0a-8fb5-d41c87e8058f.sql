-- 1. Allow shipped_quantity to be NULL (means "untouched")
ALTER TABLE public.order_items
  ALTER COLUMN shipped_quantity DROP DEFAULT,
  ALTER COLUMN shipped_quantity DROP NOT NULL;

-- 2. Add blanket close tracking columns
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS blanket_closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS blanket_closed_by uuid;

-- 3. Backfill: set shipped_quantity = NULL for items where it's currently 0
--    AND there is no shipping evidence (no inventory_allocations, no packing list entries).
--    Persist the affected invoices into a review table so the user can audit.
CREATE TABLE IF NOT EXISTS public._blanket_backfill_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid,
  invoice_number text,
  order_id uuid,
  order_number text,
  company_name text,
  affected_line_count int,
  ran_at timestamptz NOT NULL DEFAULT now()
);

WITH untouched_items AS (
  SELECT oi.id, oi.order_id
  FROM public.order_items oi
  WHERE oi.shipped_quantity = 0
    AND NOT EXISTS (
      SELECT 1 FROM public.inventory_allocations ia
      WHERE ia.order_item_id = oi.id
    )
),
updated AS (
  UPDATE public.order_items oi
  SET shipped_quantity = NULL
  FROM untouched_items ui
  WHERE oi.id = ui.id
  RETURNING oi.id, oi.order_id
)
INSERT INTO public._blanket_backfill_audit (invoice_id, invoice_number, order_id, order_number, company_name, affected_line_count)
SELECT
  i.id,
  i.invoice_number,
  o.id,
  o.order_number,
  c.name,
  COUNT(u.id)
FROM updated u
JOIN public.orders o ON o.id = u.order_id
JOIN public.invoices i ON i.order_id = o.id AND i.deleted_at IS NULL AND (i.invoice_type = 'full' OR i.invoice_type IS NULL)
LEFT JOIN public.companies c ON c.id = o.company_id
GROUP BY i.id, i.invoice_number, o.id, o.order_number, c.name;

-- 4. Rewrite recalculate_order_totals trigger with new logic:
--    - No children: per-line. NULL shipped → ordered placeholder. Set shipped (incl 0) → shipped × price.
--    - Has children + not closed: FREEZE blanket subtotal (do not touch).
--    - Has children + closed: subtotal = Σ(children.subtotal).
CREATE OR REPLACE FUNCTION public.recalculate_order_totals()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_order_id uuid;
  v_new_subtotal numeric;
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

  -- Ordered subtotal (always tracked on the order record)
  SELECT COALESCE(SUM(quantity * unit_price), 0)
  INTO v_new_subtotal
  FROM order_items
  WHERE order_id = v_order_id;

  -- Per-line effective: NULL shipped → ordered, set shipped (incl 0) → shipped × price
  SELECT COALESCE(SUM(
    CASE
      WHEN shipped_quantity IS NULL THEN quantity * unit_price
      ELSE shipped_quantity * unit_price
    END
  ), 0)
  INTO v_per_line_effective
  FROM order_items
  WHERE order_id = v_order_id;

  -- Children + closed state
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

  -- Always update order record with ordered subtotal
  UPDATE orders
  SET subtotal = v_new_subtotal,
      total = v_new_subtotal + COALESCE(tax, 0) + COALESCE(shipping_cost, 0),
      updated_at = now()
  WHERE id = v_order_id;

  IF v_has_children AND v_blanket_closed THEN
    -- Closed blanket: subtotal = Σ(children.subtotal)
    SELECT COALESCE(SUM(child.subtotal), 0)
    INTO v_children_total
    FROM invoices parent
    JOIN invoices child ON child.parent_invoice_id = parent.id AND child.deleted_at IS NULL
    WHERE parent.order_id = v_order_id
      AND (parent.invoice_type = 'full' OR parent.invoice_type IS NULL)
      AND parent.deleted_at IS NULL;

    v_blanket_subtotal := v_children_total;

    UPDATE invoices
    SET subtotal = v_blanket_subtotal,
        total = v_blanket_subtotal + COALESCE(tax, 0) + COALESCE(shipping_cost, 0),
        updated_at = now()
    WHERE order_id = v_order_id
      AND (invoice_type = 'full' OR invoice_type IS NULL)
      AND quickbooks_sync_status IS DISTINCT FROM 'synced'
      AND deleted_at IS NULL;

  ELSIF v_has_children AND NOT v_blanket_closed THEN
    -- Frozen: do nothing to blanket subtotal/total
    NULL;

  ELSE
    -- No children: per-line effective subtotal
    v_blanket_subtotal := v_per_line_effective;

    UPDATE invoices
    SET subtotal = v_blanket_subtotal,
        total = v_blanket_subtotal + COALESCE(tax, 0) + COALESCE(shipping_cost, 0),
        updated_at = now()
    WHERE order_id = v_order_id
      AND (invoice_type = 'full' OR invoice_type IS NULL)
      AND quickbooks_sync_status IS DISTINCT FROM 'synced'
      AND deleted_at IS NULL;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;