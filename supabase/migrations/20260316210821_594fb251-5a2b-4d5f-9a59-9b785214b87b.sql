
CREATE OR REPLACE FUNCTION public.recalculate_vendor_po_totals()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_total NUMERIC;
  po_shipping NUMERIC;
  target_po_id UUID;
BEGIN
  target_po_id := COALESCE(NEW.vendor_po_id, OLD.vendor_po_id);
  
  -- Calculate total using effective quantity: shipped_quantity if > 0, else quantity
  SELECT COALESCE(SUM(
    CASE WHEN shipped_quantity > 0 THEN shipped_quantity ELSE quantity END * unit_cost
  ), 0) INTO new_total
  FROM public.vendor_po_items
  WHERE vendor_po_id = target_po_id;
  
  -- Add shipping cost
  SELECT COALESCE(shipping_cost, 0) INTO po_shipping
  FROM public.vendor_pos
  WHERE id = target_po_id;
  
  UPDATE public.vendor_pos
  SET 
    total = new_total + COALESCE(po_shipping, 0),
    updated_at = now()
  WHERE id = target_po_id;
  
  RETURN COALESCE(NEW, OLD);
END;
$function$;
