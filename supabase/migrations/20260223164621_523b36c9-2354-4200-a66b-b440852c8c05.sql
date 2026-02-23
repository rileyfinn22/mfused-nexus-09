
-- Table: shipment_share_links
CREATE TABLE public.shipment_share_links (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  company_id uuid NOT NULL,
  created_by uuid,
  order_ids uuid[] NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  is_active boolean NOT NULL DEFAULT true,
  label text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.shipment_share_links ENABLE ROW LEVEL SECURITY;

-- Vibe admins: full CRUD
CREATE POLICY "Vibe admins can manage share links"
  ON public.shipment_share_links FOR ALL
  USING (has_role(auth.uid(), 'vibe_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'vibe_admin'::app_role));

-- Anonymous SELECT by token (for public page)
CREATE POLICY "Anyone can select share link by token"
  ON public.shipment_share_links FOR SELECT
  USING (true);

-- RPC: get_shipment_legs_by_token
CREATE OR REPLACE FUNCTION public.get_shipment_legs_by_token(p_token text)
RETURNS TABLE (
  leg_id uuid,
  order_id uuid,
  order_number text,
  leg_number integer,
  leg_type text,
  label text,
  origin text,
  destination text,
  carrier text,
  tracking_number text,
  tracking_url text,
  estimated_arrival timestamptz,
  actual_arrival timestamptz,
  status text,
  notes text,
  shipped_date timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link record;
BEGIN
  SELECT * INTO v_link
  FROM shipment_share_links
  WHERE shipment_share_links.token = p_token
    AND is_active = true
    AND expires_at > now();

  IF NOT FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    sl.id AS leg_id,
    sl.order_id,
    o.order_number,
    sl.leg_number,
    sl.leg_type,
    sl.label,
    sl.origin,
    sl.destination,
    sl.carrier,
    sl.tracking_number,
    sl.tracking_url,
    sl.estimated_arrival,
    sl.actual_arrival,
    sl.status,
    sl.notes,
    sl.shipped_date
  FROM shipment_legs sl
  JOIN orders o ON o.id = sl.order_id
  WHERE sl.order_id = ANY(v_link.order_ids)
  ORDER BY o.order_number, sl.leg_number;
END;
$$;

-- RPC: update_shipment_leg_public
CREATE OR REPLACE FUNCTION public.update_shipment_leg_public(
  p_token text,
  p_leg_id uuid,
  p_carrier text DEFAULT NULL,
  p_tracking_number text DEFAULT NULL,
  p_estimated_arrival timestamptz DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- Update only allowed fields
  UPDATE shipment_legs
  SET
    carrier = COALESCE(p_carrier, shipment_legs.carrier),
    tracking_number = COALESCE(p_tracking_number, shipment_legs.tracking_number),
    tracking_url = COALESCE(v_tracking_url, shipment_legs.tracking_url),
    estimated_arrival = COALESCE(p_estimated_arrival, shipment_legs.estimated_arrival),
    notes = COALESCE(p_notes, shipment_legs.notes)
  WHERE id = p_leg_id;

  RETURN json_build_object('success', true);
END;
$$;
