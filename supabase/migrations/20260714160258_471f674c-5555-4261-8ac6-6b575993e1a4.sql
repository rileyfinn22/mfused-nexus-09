
-- Auto-revert shipped quantities and recompute parent blanket when a child shipment invoice is deleted.
CREATE OR REPLACE FUNCTION public.revert_shipped_on_child_invoice_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
  v_is_child boolean;
  v_was_active boolean;
  v_is_active_now boolean;
  r record;
  v_remaining numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_order_id := OLD.order_id;
    v_is_child := OLD.parent_invoice_id IS NOT NULL;
    v_was_active := OLD.deleted_at IS NULL;
    v_is_active_now := false;
  ELSE
    v_order_id := NEW.order_id;
    v_is_child := NEW.parent_invoice_id IS NOT NULL;
    v_was_active := OLD.deleted_at IS NULL;
    v_is_active_now := NEW.deleted_at IS NULL;
  END IF;

  -- Only act when a CHILD invoice transitions from active to deleted (or hard-deleted while active).
  IF NOT v_is_child THEN RETURN COALESCE(NEW, OLD); END IF;
  IF NOT (v_was_active AND NOT v_is_active_now) THEN RETURN COALESCE(NEW, OLD); END IF;

  -- For every order_item on this order, recompute shipped_quantity from remaining (non-deleted) child allocations.
  FOR r IN
    SELECT oi.id AS order_item_id
    FROM order_items oi
    WHERE oi.order_id = v_order_id
  LOOP
    SELECT COALESCE(SUM(ia.quantity_allocated), 0)
    INTO v_remaining
    FROM inventory_allocations ia
    JOIN invoices inv ON inv.id = ia.invoice_id
    WHERE ia.order_item_id = r.order_item_id
      AND inv.deleted_at IS NULL
      AND inv.parent_invoice_id IS NOT NULL
      AND inv.order_id = v_order_id;

    IF v_remaining > 0 THEN
      UPDATE order_items SET shipped_quantity = v_remaining WHERE id = r.order_item_id;
    ELSE
      -- No remaining shipments on this line → revert to unshipped so blanket falls back to ordered.
      UPDATE order_items SET shipped_quantity = NULL WHERE id = r.order_item_id;
    END IF;
  END LOOP;

  -- order_items update above fires recalculate_order_totals which recomputes the parent blanket.
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_revert_shipped_on_child_invoice_delete ON public.invoices;
CREATE TRIGGER trg_revert_shipped_on_child_invoice_delete
AFTER UPDATE OR DELETE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.revert_shipped_on_child_invoice_delete();
