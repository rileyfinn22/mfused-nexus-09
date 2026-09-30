GRANT EXECUTE ON FUNCTION public.get_company_users(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_all_portal_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_chat_user_info(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_vibe_admins() TO authenticated;

-- Harden before re-granting: callers may only link their OWN account
CREATE OR REPLACE FUNCTION public.associate_customer_with_invoice(p_invoice_id uuid, p_user_email text)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_existing_role text;
BEGIN
  IF v_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id = v_user_id AND lower(email) = lower(p_user_email)
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Not allowed');
  END IF;

  SELECT company_id INTO v_company_id FROM invoices WHERE id = p_invoice_id AND deleted_at IS NULL;
  IF v_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invoice not found');
  END IF;

  SELECT role INTO v_existing_role FROM user_roles WHERE user_id = v_user_id AND company_id = v_company_id LIMIT 1;
  IF v_existing_role IS NOT NULL THEN
    RETURN json_build_object('success', true, 'message', 'Already has access', 'company_id', v_company_id);
  END IF;

  IF has_role(v_user_id, 'vibe_admin') THEN
    RETURN json_build_object('success', true, 'message', 'Admin access', 'company_id', v_company_id);
  END IF;

  INSERT INTO user_roles (user_id, company_id, role) VALUES (v_user_id, v_company_id, 'customer');
  RETURN json_build_object('success', true, 'message', 'Customer role assigned', 'company_id', v_company_id);
END;
$function$;
GRANT EXECUTE ON FUNCTION public.associate_customer_with_invoice(uuid, text) TO authenticated;

-- New-order alert: skip drafts; fire when a draft is finalized
CREATE OR REPLACE FUNCTION public.alert_on_customer_order()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' then
    if new.submitted_by_customer then
      perform public.queue_internal_alert('order_submitted', new.id, new.company_id);
    end if;
    if coalesce(new.status::text, '') <> 'draft' then
      perform public.queue_internal_alert('order_created', new.id, new.company_id);
    end if;
  elsif tg_op = 'UPDATE' then
    if old.status::text = 'draft' and coalesce(new.status::text, '') <> 'draft' then
      perform public.queue_internal_alert('order_created', new.id, new.company_id);
    end if;
  end if;
  return new;
end;
$function$;

DROP TRIGGER IF EXISTS trg_orders_order_finalized_alert ON public.orders;
CREATE TRIGGER trg_orders_order_finalized_alert AFTER UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.alert_on_customer_order();