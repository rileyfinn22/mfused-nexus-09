-- Create table for vendor PO packing lists
CREATE TABLE public.vendor_po_packing_lists (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor_po_id UUID NOT NULL REFERENCES public.vendor_pos(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  file_type TEXT,
  source TEXT DEFAULT 'uploaded', -- 'uploaded' (original) or 'generated' (branded)
  original_packing_list_id UUID REFERENCES public.vendor_po_packing_lists(id) ON DELETE SET NULL, -- link generated to original
  parsed_data JSONB, -- Store parsed data from vendor packing list
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

-- Enable RLS
ALTER TABLE public.vendor_po_packing_lists ENABLE ROW LEVEL SECURITY;

-- Vibe admins can manage all packing lists
CREATE POLICY "Vibe admins can manage vendor PO packing lists"
ON public.vendor_po_packing_lists
FOR ALL
USING (has_role(auth.uid(), 'vibe_admin'::app_role));

-- Users with company access can view packing lists for their orders
CREATE POLICY "Users can view packing lists for their orders"
ON public.vendor_po_packing_lists
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.vendor_pos vpo
    JOIN public.orders o ON vpo.order_id = o.id
    WHERE vpo.id = vendor_po_packing_lists.vendor_po_id
    AND user_has_company_access(auth.uid(), o.company_id)
  )
);

-- Create index for faster lookups
CREATE INDEX idx_vendor_po_packing_lists_vendor_po_id ON public.vendor_po_packing_lists(vendor_po_id);
CREATE INDEX idx_vendor_po_packing_lists_source ON public.vendor_po_packing_lists(source);