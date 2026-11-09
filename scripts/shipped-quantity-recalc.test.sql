-- Integration regression against invoice 11052; all changes roll back.
BEGIN;
DO $$
DECLARE
  v_invoice_id uuid := '6e621656-c6d8-45ac-a387-51f6ba815bd1';
  v_order_id uuid := 'f690a830-5821-4509-bbca-37c986da8faa';
  v_before numeric;
  v_after numeric;
  v_expected numeric;
  v_count integer;
BEGIN
  PERFORM 1 FROM public.orders WHERE id = v_order_id FOR UPDATE;
  SELECT SUM(shipped_quantity * unit_price) INTO v_before
    FROM public.order_items WHERE order_id = v_order_id;
  UPDATE public.invoices SET subtotal = v_before, total = v_before
    WHERE id = v_invoice_id;
  UPDATE public.order_items SET shipped_quantity = shipped_quantity - 200
    WHERE order_id = v_order_id
      AND item_id IN ('MF-SUP-NY-JEFE-V2-2G-FIRE-ATF', 'MF-SUP-NY-JEFE-V2-2G-FIRE-BLUEDREAM')
      AND unit_price = 0.218 AND shipped_quantity >= 200;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 2 THEN RAISE EXCEPTION 'Expected two 200-piece edits'; END IF;
  SELECT subtotal INTO v_after FROM public.invoices WHERE id = v_invoice_id;
  SELECT SUM(shipped_quantity * unit_price) INTO v_expected
    FROM public.order_items WHERE order_id = v_order_id;
  IF v_before - v_after IS DISTINCT FROM 87.20 OR v_after IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION '400 pieces at $0.218 must reduce invoice by $87.20; before %, after %, expected %', v_before, v_after, v_expected;
  END IF;
  IF (SELECT quickbooks_sync_status FROM public.invoices WHERE id = v_invoice_id) IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'Edited invoice must be marked pending QuickBooks sync';
  END IF;
END $$;
ROLLBACK;