CREATE OR REPLACE FUNCTION public.save_order_lines(p_order_id uuid, p_lines jsonb)
RETURNS numeric LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_ids uuid[]; v_subtotal numeric; v_count integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'vibe_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Staff access required' USING ERRCODE = '42501';
  END IF;
  PERFORM id FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found or access denied'; END IF;
  IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Expected product lines'; END IF;
  SELECT array_agg(x.id), count(*) INTO v_ids, v_count
  FROM jsonb_to_recordset(p_lines) AS x(id uuid);
  IF v_count <> (SELECT count(DISTINCT x.id) FROM jsonb_to_recordset(p_lines) AS x(id uuid)) THEN
    RAISE EXCEPTION 'Each line must have a distinct ID';
  END IF;
  IF EXISTS (SELECT 1 FROM public.order_items i WHERE i.id = ANY(v_ids) AND i.order_id <> p_order_id) THEN
    RAISE EXCEPTION 'Line belongs to another order';
  END IF;
  -- Free sequence positions inside this transaction before reordering/upserting.
  -- Failure anywhere rolls these changes and all deletions back together.
  WITH positions AS (
    SELECT id, row_number() OVER (ORDER BY id) AS n FROM public.order_items WHERE order_id = p_order_id
  ) UPDATE public.order_items i SET line_number = -1000000000 - positions.n::integer
    FROM positions WHERE i.id = positions.id;
  INSERT INTO public.order_items (id, order_id, product_id, sku, item_id, name, description, quantity, unit_price, total, line_number)
  SELECT x.id, p_order_id, x.product_id, x.sku, x.item_id, x.name, x.description, x.quantity, x.unit_price,
    x.quantity * x.unit_price, x.line_number
  FROM jsonb_to_recordset(p_lines) AS x(id uuid, product_id uuid, sku text, item_id text, name text, description text, quantity integer, unit_price numeric, line_number integer)
  ON CONFLICT (id) DO UPDATE SET product_id = excluded.product_id, sku = excluded.sku,
    item_id = excluded.item_id, name = excluded.name, description = excluded.description,
    quantity = excluded.quantity, unit_price = excluded.unit_price, line_number = excluded.line_number;
  DELETE FROM public.order_items WHERE order_id = p_order_id AND NOT (id = ANY(coalesce(v_ids, ARRAY[]::uuid[])));
  SELECT count(*), coalesce(sum(quantity * unit_price),0) INTO v_count, v_subtotal FROM public.order_items WHERE order_id = p_order_id;
  IF v_count <> jsonb_array_length(p_lines) THEN RAISE EXCEPTION 'Not all product lines saved'; END IF;
  UPDATE public.orders SET subtotal = v_subtotal, total = v_subtotal + coalesce(tax,0) + coalesce(shipping_cost,0) WHERE id = p_order_id;
  RETURN v_subtotal;
END;
$$;
REVOKE ALL ON FUNCTION public.save_order_lines(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_order_lines(uuid,jsonb) TO authenticated, service_role;