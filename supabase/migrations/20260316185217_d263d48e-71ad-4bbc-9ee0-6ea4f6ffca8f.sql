
-- Create financed_invoices table
CREATE TABLE public.financed_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  financed_amount numeric NOT NULL DEFAULT 0,
  financed_amount_rmb numeric NOT NULL DEFAULT 0,
  exchange_rate numeric NOT NULL DEFAULT 7.2,
  financed_date timestamptz NOT NULL DEFAULT now(),
  paid_back_date timestamptz,
  paid_back_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create finance_share_links table
CREATE TABLE public.finance_share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  label text,
  is_active boolean NOT NULL DEFAULT true,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '1 year'),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create finance_deposits table
CREATE TABLE public.finance_deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  amount numeric NOT NULL DEFAULT 0,
  payment_date timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on all three tables
ALTER TABLE public.financed_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_share_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_deposits ENABLE ROW LEVEL SECURITY;

-- RLS policies: vibe_admin only
CREATE POLICY "Vibe admins full access on financed_invoices"
  ON public.financed_invoices FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'vibe_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'vibe_admin'));

CREATE POLICY "Vibe admins full access on finance_share_links"
  ON public.finance_share_links FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'vibe_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'vibe_admin'));

CREATE POLICY "Vibe admins full access on finance_deposits"
  ON public.finance_deposits FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'vibe_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'vibe_admin'));

-- Updated_at trigger for financed_invoices
CREATE TRIGGER update_financed_invoices_updated_at
  BEFORE UPDATE ON public.financed_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Security definer function for public finance view
CREATE OR REPLACE FUNCTION public.get_finance_data_by_token(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link record;
  v_invoices json;
  v_deposits json;
  v_total_deposited numeric;
  v_total_open_financed numeric;
BEGIN
  -- Validate token
  SELECT * INTO v_link
  FROM finance_share_links
  WHERE token = p_token
    AND is_active = true
    AND expires_at > now();

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Invalid or expired link');
  END IF;

  -- Get all financed invoices
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
      i.invoice_number,
      o.order_number,
      o.customer_name
    FROM financed_invoices fi
    LEFT JOIN invoices i ON fi.invoice_id = i.id
    LEFT JOIN orders o ON i.order_id = o.id
    ORDER BY fi.financed_date DESC
  ) fi;

  -- Get deposits
  SELECT json_agg(row_to_json(fd)), COALESCE(SUM(fd.amount), 0)
  INTO v_deposits, v_total_deposited
  FROM finance_deposits fd;

  -- Total open financed
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
$$;
