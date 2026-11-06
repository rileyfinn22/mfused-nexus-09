CREATE OR REPLACE FUNCTION public.next_order_number()
RETURNS text LANGUAGE plpgsql VOLATILE SET search_path TO 'public'
AS $function$
DECLARE v_max bigint; v_last bigint; v_next bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(846201126);
  SELECT COALESCE(MAX(substring(order_number from '^(?:ORD-)?([0-9]{5,6})$')::bigint), 10699) INTO v_max FROM public.orders;
  SELECT last_value INTO v_last FROM public.order_number_seq;
  IF v_last > 999999 OR v_last < 10699 THEN v_last := v_max; END IF;
  v_next := GREATEST(v_last, v_max) + 1;
  IF v_next > 999999 THEN RAISE EXCEPTION 'Order number range exhausted'; END IF;
  PERFORM setval('public.order_number_seq', v_next, true);
  RETURN v_next::text;
END;
$function$;
CREATE OR REPLACE FUNCTION public.orders_keep_number_sequence()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE v_num bigint; v_last bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(846201126);
  IF NEW.order_number IS NULL OR btrim(NEW.order_number) = '' OR NEW.order_number ~ '^[0-9]{7,}$' THEN
    NEW.order_number := public.next_order_number();
    RETURN NEW;
  END IF;
  v_num := substring(NEW.order_number from '^(?:ORD-)?([0-9]{5,6})$')::bigint;
  IF v_num IS NOT NULL THEN
    SELECT last_value INTO v_last FROM public.order_number_seq;
    IF v_last > 999999 THEN
      SELECT GREATEST(v_num, COALESCE(MAX(substring(order_number from '^(?:ORD-)?([0-9]{5,6})$')::bigint),10699)) INTO v_num FROM public.orders;
      PERFORM setval('public.order_number_seq', v_num, true);
    ELSIF v_num > v_last THEN
      PERFORM setval('public.order_number_seq', v_num, true);
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;