
ALTER TABLE public.financed_invoices
ADD COLUMN vendor_po_id uuid REFERENCES public.vendor_pos(id) ON DELETE SET NULL;

-- Update the security definer function to include vendor PO info
CREATE OR REPLACE FUNCTION public.get_finance_data_by_token(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_link record;
  v_invoices json;
  v_deposits json;
  v_total_deposited numeric;
  v_total_open_financed numeric;
BEGIN
  SELECT * INTO v_link
  FROM finance_share_links
  WHERE token = p_token
    AND is_active = true
    AND expires_at > now();

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Invalid or expired link');
  END IF;

  SELECT json_agg(row_to_json(fi))
  INTO v_invoices
  FROM (
    SELECT 
      fi.id,
      fi.financed_amount,
      fi.financed_amount_rmb,
      fi.exchange_rate,
      fi.financed_date,
      fi.paid_back_date,
      fi.paid_back_amount,
      fi.status,
      fi.notes,
      fi.vendor_po_id,
      i.invoice_number,
      o.order_number,
      o.customer_name,
      vp.po_number as vendor_po_number,
      vp.description as vendor_po_description
    FROM financed_invoices fi
    LEFT JOIN invoices i ON fi.invoice_id = i.id
    LEFT JOIN orders o ON i.order_id = o.id
    LEFT JOIN vendor_pos vp ON fi.vendor_po_id = vp.id
    ORDER BY fi.financed_date DESC
  ) fi;

  SELECT json_agg(row_to_json(fd)), COALESCE(SUM(fd.amount), 0)
  INTO v_deposits, v_total_deposited
  FROM finance_deposits fd;

  SELECT COALESCE(SUM(financed_amount), 0)
  INTO v_total_open_financed
  FROM financed_invoices
  WHERE status = 'open';

  RETURN json_build_object(
    'success', true,
    'label', v_link.label,
    'invoices', COALESCE(v_invoices, '[]'::json),
    'deposits', COALESCE(v_deposits, '[]'::json),
    'total_deposited', v_total_deposited,
    'total_open_financed', v_total_open_financed,
    'required_deposit', v_total_open_financed * 0.10
  );
END;
$function$;
