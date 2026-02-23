
-- RPC: add_shipment_leg_public
-- Allows vendors to add new shipment legs via a valid share token
CREATE OR REPLACE FUNCTION public.add_shipment_leg_public(
  p_token text,
  p_order_id uuid,
  p_leg_type text DEFAULT 'domestic',
  p_origin text DEFAULT NULL,
  p_destination text DEFAULT NULL,
  p_carrier text DEFAULT NULL,
  p_tracking_number text DEFAULT NULL,
  p_estimated_arrival timestamptz DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_link record;
  v_order record;
  v_next_leg_number integer;
  v_tracking_url text;
  v_new_id uuid;
BEGIN
  -- Validate token
  SELECT * INTO v_link
  FROM shipment_share_links
  WHERE shipment_share_links.token = p_token
    AND is_active = true
    AND expires_at > now();

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Invalid or expired link');
  END IF;

  -- Validate order is in this link
  IF NOT (p_order_id = ANY(v_link.order_ids)) THEN
    RETURN json_build_object('success', false, 'error', 'Order not found for this link');
  END IF;

  -- Get company_id from order
  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Order not found');
  END IF;

  -- Calculate next leg number
  SELECT COALESCE(MAX(leg_number), 0) + 1 INTO v_next_leg_number
  FROM shipment_legs
  WHERE order_id = p_order_id;

  -- Auto-generate tracking URL
  v_tracking_url := NULL;
  IF p_carrier IS NOT NULL AND p_tracking_number IS NOT NULL AND p_tracking_number != '' THEN
    v_tracking_url := CASE lower(trim(p_carrier))
      WHEN 'ups' THEN 'https://www.ups.com/track?tracknum=' || p_tracking_number
      WHEN 'fedex' THEN 'https://www.fedex.com/fedextrack/?trknbr=' || p_tracking_number
      WHEN 'usps' THEN 'https://tools.usps.com/go/TrackConfirmAction?tLabels=' || p_tracking_number
      WHEN 'dhl' THEN 'https://www.dhl.com/us-en/home/tracking.html?tracking-id=' || p_tracking_number
      WHEN 'maersk' THEN 'https://www.maersk.com/tracking/' || p_tracking_number
      WHEN 'msc' THEN 'https://www.msc.com/track-a-shipment?agencyPath=usa&trackingNumber=' || p_tracking_number
      WHEN 'cma cgm' THEN 'https://www.cma-cgm.com/ebusiness/tracking/search?SearchBy=ContainerMBL&Reference=' || p_tracking_number
      ELSE NULL
    END;
  END IF;

  -- Insert new leg
  INSERT INTO shipment_legs (
    order_id, company_id, leg_number, leg_type, origin, destination,
    carrier, tracking_number, tracking_url, estimated_arrival, notes, status
  ) VALUES (
    p_order_id, v_order.company_id, v_next_leg_number, p_leg_type, p_origin, p_destination,
    p_carrier, p_tracking_number, v_tracking_url, p_estimated_arrival, p_notes, 'pending'
  )
  RETURNING id INTO v_new_id;

  RETURN json_build_object('success', true, 'leg_id', v_new_id, 'leg_number', v_next_leg_number);
END;
$$;

-- Also update the existing update function to allow editing origin, destination, leg_type, and status
CREATE OR REPLACE FUNCTION public.update_shipment_leg_public(
  p_token text,
  p_leg_id uuid,
  p_carrier text DEFAULT NULL,
  p_tracking_number text DEFAULT NULL,
  p_estimated_arrival timestamptz DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_origin text DEFAULT NULL,
  p_destination text DEFAULT NULL,
  p_leg_type text DEFAULT NULL,
  p_status text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_link record;
  v_leg record;
  v_tracking_url text;
BEGIN
  -- Validate token
  SELECT * INTO v_link
  FROM shipment_share_links
  WHERE shipment_share_links.token = p_token
    AND is_active = true
    AND expires_at > now();

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Invalid or expired link');
  END IF;

  -- Validate leg belongs to an order in this link
  SELECT * INTO v_leg
  FROM shipment_legs
  WHERE id = p_leg_id
    AND order_id = ANY(v_link.order_ids);

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Shipment leg not found for this link');
  END IF;

  -- Auto-generate tracking URL
  v_tracking_url := NULL;
  IF p_carrier IS NOT NULL AND p_tracking_number IS NOT NULL AND p_tracking_number != '' THEN
    v_tracking_url := CASE lower(trim(p_carrier))
      WHEN 'ups' THEN 'https://www.ups.com/track?tracknum=' || p_tracking_number
      WHEN 'fedex' THEN 'https://www.fedex.com/fedextrack/?trknbr=' || p_tracking_number
      WHEN 'usps' THEN 'https://tools.usps.com/go/TrackConfirmAction?tLabels=' || p_tracking_number
      WHEN 'dhl' THEN 'https://www.dhl.com/us-en/home/tracking.html?tracking-id=' || p_tracking_number
      WHEN 'maersk' THEN 'https://www.maersk.com/tracking/' || p_tracking_number
      WHEN 'msc' THEN 'https://www.msc.com/track-a-shipment?agencyPath=usa&trackingNumber=' || p_tracking_number
      WHEN 'cma cgm' THEN 'https://www.cma-cgm.com/ebusiness/tracking/search?SearchBy=ContainerMBL&Reference=' || p_tracking_number
      ELSE NULL
    END;
  END IF;

  -- Update allowed fields
  UPDATE shipment_legs
  SET
    carrier = COALESCE(p_carrier, shipment_legs.carrier),
    tracking_number = COALESCE(p_tracking_number, shipment_legs.tracking_number),
    tracking_url = COALESCE(v_tracking_url, shipment_legs.tracking_url),
    estimated_arrival = COALESCE(p_estimated_arrival, shipment_legs.estimated_arrival),
    notes = COALESCE(p_notes, shipment_legs.notes),
    origin = COALESCE(p_origin, shipment_legs.origin),
    destination = COALESCE(p_destination, shipment_legs.destination),
    leg_type = COALESCE(p_leg_type, shipment_legs.leg_type),
    status = COALESCE(p_status, shipment_legs.status)
  WHERE id = p_leg_id;

  RETURN json_build_object('success', true);
END;
$$;
