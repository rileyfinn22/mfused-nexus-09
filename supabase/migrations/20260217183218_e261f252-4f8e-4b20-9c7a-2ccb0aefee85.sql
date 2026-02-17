
-- Drop the invoice-based trigger first, then the function
DROP TRIGGER IF EXISTS auto_complete_order_on_payment ON public.invoices;
DROP TRIGGER IF EXISTS trigger_auto_complete_order ON public.invoices;
DROP FUNCTION IF EXISTS public.auto_complete_order_on_full_payment() CASCADE;

-- Ensure the production progress trigger is correct
CREATE OR REPLACE FUNCTION public.auto_complete_order_on_progress()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status NOT IN ('completed', 'cancelled') AND NEW.production_progress >= 100 THEN
    NEW.status := 'completed';
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trigger_auto_complete_on_progress ON public.orders;
CREATE TRIGGER trigger_auto_complete_on_progress
  BEFORE UPDATE OF production_progress ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_complete_order_on_progress();
