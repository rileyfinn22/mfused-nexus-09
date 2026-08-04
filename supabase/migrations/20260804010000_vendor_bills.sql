-- Vendor bills: the vendor's own invoice, attached to the PO.
--
-- A PO is what we ordered. A bill is what the vendor charged us. They are different documents
-- and were previously crammed into one row, which meant recording a bill destroyed the ordered
-- prices it was supposed to be compared against.
--
-- Attaching a bill now drives vendor_pos.final_total, so project profit, AP, vendor statements
-- and Send to Finance all follow the vendor's actual invoice without any of those screens
-- changing -- they already read `final_total ?? total`.
--
-- A PO can receive several bills (partial shipments each get their own invoice), so final_total
-- is the SUM of the bills on the PO.

CREATE TABLE IF NOT EXISTS public.vendor_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_po_id uuid NOT NULL REFERENCES public.vendor_pos(id) ON DELETE CASCADE,
  company_id uuid,
  invoice_number text,
  bill_date date,
  due_date date,
  subtotal numeric NOT NULL DEFAULT 0,
  freight numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  document_path text,
  document_name text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vendor_bills_vendor_po_id_idx ON public.vendor_bills(vendor_po_id);

ALTER TABLE public.vendor_bills ENABLE ROW LEVEL SECURITY;

-- Vendor pricing is admin-only. Vendors must never see what we were billed by anyone, and
-- customers must never see cost at all.
DROP POLICY IF EXISTS "Vibe admins manage vendor bills" ON public.vendor_bills;
CREATE POLICY "Vibe admins manage vendor bills"
ON public.vendor_bills
FOR ALL
USING (public.has_role(auth.uid(), 'vibe_admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'vibe_admin'::public.app_role));

DROP TRIGGER IF EXISTS update_vendor_bills_updated_at ON public.vendor_bills;
CREATE TRIGGER update_vendor_bills_updated_at
BEFORE UPDATE ON public.vendor_bills
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Recalc now prefers an attached bill over anything derived from line items.
CREATE OR REPLACE FUNCTION public.vendor_po_recalc(target_po_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  ordered_items  NUMERIC := 0;
  billed_items   NUMERIC := 0;
  ordered_ship   NUMERIC := 0;
  billed_ship    NUMERIC := 0;
  po_shipping    NUMERIC := 0;
  has_billed     BOOLEAN := false;
  bill_count     INTEGER := 0;
  bill_total     NUMERIC := 0;
BEGIN
  IF target_po_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    COALESCE(SUM(i.quantity * i.unit_cost)
             FILTER (WHERE NOT is_ship), 0),
    COALESCE(SUM(COALESCE(i.final_quantity, NULLIF(i.shipped_quantity, 0), i.quantity)
                 * COALESCE(i.final_unit_cost, i.unit_cost))
             FILTER (WHERE NOT is_ship), 0),
    COALESCE(SUM(i.quantity * i.unit_cost)
             FILTER (WHERE is_ship), 0),
    COALESCE(SUM(COALESCE(i.final_quantity, NULLIF(i.shipped_quantity, 0), i.quantity)
                 * COALESCE(i.final_unit_cost, i.unit_cost))
             FILTER (WHERE is_ship), 0),
    COALESCE(BOOL_OR(i.final_quantity IS NOT NULL
                     OR i.final_unit_cost IS NOT NULL
                     OR COALESCE(i.shipped_quantity, 0) > 0), false)
  INTO ordered_items, billed_items, ordered_ship, billed_ship, has_billed
  FROM (
    SELECT i.*,
           (COALESCE(i.sku, '') = 'SHIPPING' OR COALESCE(i.item_type, '') = 'shipping') AS is_ship
    FROM public.vendor_po_items i
    WHERE i.vendor_po_id = target_po_id
  ) i;

  SELECT COALESCE(shipping_cost, 0) INTO po_shipping
  FROM public.vendor_pos
  WHERE id = target_po_id;

  SELECT COUNT(*), COALESCE(SUM(total), 0)
  INTO bill_count, bill_total
  FROM public.vendor_bills
  WHERE vendor_po_id = target_po_id;

  UPDATE public.vendor_pos
  SET total = ROUND((ordered_items + COALESCE(NULLIF(ordered_ship, 0), po_shipping, 0))::numeric, 2),
      final_total = CASE
        -- An attached vendor invoice is the most authoritative thing we have: a human read it.
        WHEN bill_count > 0 THEN ROUND(bill_total::numeric, 2)
        WHEN has_billed
          THEN ROUND((billed_items + COALESCE(NULLIF(billed_ship, 0), po_shipping, 0))::numeric, 2)
        ELSE NULL
      END,
      updated_at = now()
  WHERE id = target_po_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.recalculate_vendor_po_on_bill()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.vendor_po_recalc(COALESCE(NEW.vendor_po_id, OLD.vendor_po_id));
  -- A bill moved to a different PO has to refresh both sides.
  IF TG_OP = 'UPDATE' AND NEW.vendor_po_id IS DISTINCT FROM OLD.vendor_po_id THEN
    PERFORM public.vendor_po_recalc(OLD.vendor_po_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS trg_vendor_bill_recalc ON public.vendor_bills;
CREATE TRIGGER trg_vendor_bill_recalc
AFTER INSERT OR UPDATE OR DELETE ON public.vendor_bills
FOR EACH ROW
EXECUTE FUNCTION public.recalculate_vendor_po_on_bill();

REVOKE EXECUTE ON FUNCTION public.recalculate_vendor_po_on_bill() FROM PUBLIC, anon, authenticated;
