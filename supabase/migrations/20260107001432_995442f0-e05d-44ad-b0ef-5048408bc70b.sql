-- Add total_paid and payment status tracking to vendor_pos
ALTER TABLE public.vendor_pos 
ADD COLUMN total_paid numeric DEFAULT 0,
ADD COLUMN final_total numeric DEFAULT NULL,
ADD COLUMN notes text DEFAULT NULL;

-- Add shipped_quantity tracking is already on vendor_po_items, but let's add a final_unit_cost column
-- for when the actual cost differs from the quoted cost
ALTER TABLE public.vendor_po_items
ADD COLUMN final_unit_cost numeric DEFAULT NULL,
ADD COLUMN final_quantity integer DEFAULT NULL,
ADD COLUMN item_type text DEFAULT 'product',
ADD COLUMN is_adjustment boolean DEFAULT false;

-- Create vendor_po_payments table (mirrors payments table for invoices)
CREATE TABLE public.vendor_po_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL,
  vendor_po_id UUID NOT NULL REFERENCES public.vendor_pos(id) ON DELETE CASCADE,
  payment_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  amount NUMERIC NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'wire',
  reference_number TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.vendor_po_payments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for vendor_po_payments
CREATE POLICY "Vibe admins can view vendor PO payments" 
ON public.vendor_po_payments 
FOR SELECT 
USING (has_role(auth.uid(), 'vibe_admin'::app_role));

CREATE POLICY "Vibe admins can create vendor PO payments" 
ON public.vendor_po_payments 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'vibe_admin'::app_role));

CREATE POLICY "Vibe admins can update vendor PO payments" 
ON public.vendor_po_payments 
FOR UPDATE 
USING (has_role(auth.uid(), 'vibe_admin'::app_role));

CREATE POLICY "Vibe admins can delete vendor PO payments" 
ON public.vendor_po_payments 
FOR DELETE 
USING (has_role(auth.uid(), 'vibe_admin'::app_role));

-- Create trigger to auto-update vendor_po payment status
CREATE OR REPLACE FUNCTION public.update_vendor_po_payment_status()
RETURNS TRIGGER AS $$
DECLARE
  po_total NUMERIC;
  payment_total NUMERIC;
  final_po_total NUMERIC;
BEGIN
  -- Get the vendor PO totals
  SELECT total, final_total INTO po_total, final_po_total
  FROM vendor_pos
  WHERE id = COALESCE(NEW.vendor_po_id, OLD.vendor_po_id);
  
  -- Use final_total if set, otherwise use total
  po_total := COALESCE(final_po_total, po_total);
  
  -- Calculate total payments for this vendor PO
  SELECT COALESCE(SUM(amount), 0) INTO payment_total
  FROM vendor_po_payments
  WHERE vendor_po_id = COALESCE(NEW.vendor_po_id, OLD.vendor_po_id);
  
  -- Update vendor PO total_paid and status
  UPDATE vendor_pos
  SET 
    total_paid = payment_total,
    status = CASE
      WHEN payment_total >= po_total THEN 'paid'
      WHEN payment_total > 0 THEN 'partial'
      ELSE 'unpaid'
    END
  WHERE id = COALESCE(NEW.vendor_po_id, OLD.vendor_po_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER update_vendor_po_payment_status_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.vendor_po_payments
FOR EACH ROW
EXECUTE FUNCTION public.update_vendor_po_payment_status();

-- Create trigger for updated_at
CREATE TRIGGER update_vendor_po_payments_updated_at
BEFORE UPDATE ON public.vendor_po_payments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Update existing vendor_pos to have 'unpaid' status instead of 'draft'
UPDATE public.vendor_pos SET status = 'unpaid' WHERE status = 'draft';
UPDATE public.vendor_pos SET status = 'unpaid' WHERE status = 'pending';
UPDATE public.vendor_pos SET status = 'unpaid' WHERE status = 'sent';