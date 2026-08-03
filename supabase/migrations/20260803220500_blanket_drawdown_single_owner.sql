-- Single owner for blanket-invoice totals (draw-down model).
-- Business rules (Riley, 2026-08-03):
--   * The blanket is the whole receivable; children bill against it.
--   * OPEN blanket subtotal = per-line GREATEST(ordered, shipped):
--       overs grow the blanket immediately; unders never shrink it mid-drawdown.
--   * On CLOSE, the blanket snaps once to per-line COALESCE(shipped, ordered).
--     Already-closed blankets are never rewritten by later item edits, and
--     'paid' / QuickBooks-synced blankets are never rewritten at all — historical
--     unbilled overs stay written off.
-- This replaces the "freeze blankets that have children" behavior, which left the
-- update to five inconsistent client-side writers.

CREATE OR REPLACE FUNCTION public.recalc_blanket_invoices_for_order(
  p_order_id uuid,
  p_include_closed boolean DEFAULT false,
  p_only_invoice_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_open_sub numeric;
  v_closed_sub numeric;
BEGIN
  SELECT
    COALESCE(SUM(GREATEST(quantity, COALESCE(shipped_quantity, 0)) * unit_price), 0),
    COALESCE(SUM(COALESCE(shipped_quantity, quantity) * unit_price), 0)
  INTO v_open_sub, v_closed_sub
  FROM order_items
  WHERE order_id = p_order_id;

  UPDATE invoices i
  SET subtotal = CASE WHEN i.blanket_closed_at IS NULL THEN v_open_sub ELSE v_closed_sub END,
      total = (CASE WHEN i.blanket_closed_at IS NULL THEN v_open_sub ELSE v_closed_sub END)
              + COALESCE(i.tax, 0) + COALESCE(i.shipping_cost, 0),
      updated_at = now()
  WHERE i.order_id = p_order_id
    AND (i.invoice_type = 'full' OR i.invoice_type IS NULL)
    AND i.parent_invoice_id IS NULL
    AND i.deleted_at IS NULL
    AND (p_include_closed OR i.blanket_closed_at IS NULL)
    AND (p_only_invoice_id IS NULL OR i.id = p_only_invoice_id)
    AND i.status IS DISTINCT FROM 'paid'
    AND i.quickbooks_sync_status IS DISTINCT FROM 'synced'
    AND i.subtotal IS DISTINCT FROM
        (CASE WHEN i.blanket_closed_at IS NULL THEN v_open_sub ELSE v_closed_sub END);
END;
$function$;

CREATE OR REPLACE FUNCTION public.recalculate_order_totals()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_order_id uuid;
  v_ordered_subtotal numeric;
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

  UPDATE orders
  SET subtotal = v_ordered_subtotal,
      total = v_ordered_subtotal + COALESCE(tax, 0) + COALESCE(shipping_cost, 0),
      updated_at = now()
  WHERE id = v_order_id;

  -- Open blankets only; closed blankets were snapped once at close time.
  PERFORM public.recalc_blanket_invoices_for_order(v_order_id, false, NULL);

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Closing a blanket snaps it to shipped actuals exactly once (no order_items row
-- changes at that moment, so the item trigger can't do it). Reopening recomputes
-- under the open rule the same way.
CREATE OR REPLACE FUNCTION public.recalc_blanket_on_close()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.order_id IS NOT NULL THEN
    PERFORM public.recalc_blanket_invoices_for_order(NEW.order_id, true, NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_recalc_blanket_on_close ON public.invoices;
CREATE TRIGGER trg_recalc_blanket_on_close
AFTER UPDATE OF blanket_closed_at ON public.invoices
FOR EACH ROW
WHEN (OLD.blanket_closed_at IS DISTINCT FROM NEW.blanket_closed_at)
EXECUTE FUNCTION public.recalc_blanket_on_close();
