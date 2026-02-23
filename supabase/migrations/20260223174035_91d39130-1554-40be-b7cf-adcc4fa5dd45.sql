
-- RPC to delete a shipment leg via public token
CREATE OR REPLACE FUNCTION public.delete_shipment_leg_public(
  p_token text,
  p_leg_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link record;
  v_leg record;
BEGIN
  -- Validate token
  SELECT * INTO v_link
  FROM shipment_share_links
  WHERE token = p_token
    AND is_active = true
    AND expires_at > now();

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Invalid or expired token');
  END IF;

  -- Verify leg belongs to an order in this token's order_ids
  SELECT * INTO v_leg
  FROM shipment_legs
  WHERE id = p_leg_id
    AND order_id = ANY(v_link.order_ids);

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Leg not found or not authorized');
  END IF;

  -- Delete the leg
  DELETE FROM shipment_legs WHERE id = p_leg_id;

  -- Renumber remaining legs for this order
  WITH numbered AS (
    SELECT id, row_number() OVER (ORDER BY leg_number) AS new_num
    FROM shipment_legs
    WHERE order_id = v_leg.order_id
  )
  UPDATE shipment_legs sl
  SET leg_number = n.new_num
  FROM numbered n
  WHERE sl.id = n.id;

  RETURN json_build_object('success', true);
END;
$$;
