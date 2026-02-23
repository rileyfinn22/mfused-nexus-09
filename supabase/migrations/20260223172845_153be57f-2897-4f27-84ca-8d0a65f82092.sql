
-- RPC to reorder a shipment leg (swap leg_numbers) via public token
CREATE OR REPLACE FUNCTION public.reorder_shipment_leg_public(
  p_token text,
  p_leg_id uuid,
  p_direction text -- 'up' or 'down'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link shipment_share_links%ROWTYPE;
  v_leg shipment_legs%ROWTYPE;
  v_swap_leg shipment_legs%ROWTYPE;
BEGIN
  -- Validate token
  SELECT * INTO v_link FROM shipment_share_links
  WHERE token = p_token AND is_active = true AND expires_at > now();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired token');
  END IF;

  -- Get the leg
  SELECT * INTO v_leg FROM shipment_legs WHERE id = p_leg_id;
  IF NOT FOUND OR v_leg.order_id != ALL(v_link.order_ids) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Leg not found or not authorized');
  END IF;

  -- Find the adjacent leg to swap with
  IF p_direction = 'up' THEN
    SELECT * INTO v_swap_leg FROM shipment_legs
    WHERE order_id = v_leg.order_id AND leg_number < v_leg.leg_number
    ORDER BY leg_number DESC LIMIT 1;
  ELSIF p_direction = 'down' THEN
    SELECT * INTO v_swap_leg FROM shipment_legs
    WHERE order_id = v_leg.order_id AND leg_number > v_leg.leg_number
    ORDER BY leg_number ASC LIMIT 1;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Invalid direction');
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already at boundary');
  END IF;

  -- Swap leg_numbers
  UPDATE shipment_legs SET leg_number = v_swap_leg.leg_number WHERE id = v_leg.id;
  UPDATE shipment_legs SET leg_number = v_leg.leg_number WHERE id = v_swap_leg.id;

  RETURN jsonb_build_object('success', true);
END;
$$;
