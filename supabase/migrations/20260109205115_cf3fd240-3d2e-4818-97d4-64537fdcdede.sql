
-- Create function to auto-update order status based on production stages
CREATE OR REPLACE FUNCTION public.update_order_status_from_stages()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  all_completed BOOLEAN;
  order_record RECORD;
BEGIN
  -- Get the order for this stage
  SELECT * INTO order_record FROM orders WHERE id = NEW.order_id;
  
  -- Skip if order not found or is a pull_ship type
  IF order_record IS NULL OR order_record.order_type = 'pull_ship' THEN
    RETURN NEW;
  END IF;
  
  -- Check if all stages for this order are completed
  SELECT NOT EXISTS (
    SELECT 1 FROM production_stages 
    WHERE order_id = NEW.order_id 
    AND status != 'completed'
  ) INTO all_completed;
  
  -- Update order status based on stage completion
  IF all_completed THEN
    UPDATE orders SET status = 'completed', updated_at = now() WHERE id = NEW.order_id;
  ELSE
    -- Revert to 'in production' if stages are edited back
    IF order_record.status = 'completed' THEN
      UPDATE orders SET status = 'in production', updated_at = now() WHERE id = NEW.order_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on production_stages
DROP TRIGGER IF EXISTS trigger_update_order_status_from_stages ON public.production_stages;
CREATE TRIGGER trigger_update_order_status_from_stages
  AFTER INSERT OR UPDATE ON public.production_stages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_order_status_from_stages();
