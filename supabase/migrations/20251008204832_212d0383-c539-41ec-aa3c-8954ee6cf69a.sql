-- Add policy for vibe_admin to create vendor POs
CREATE POLICY "Vibe admins can create vendor POs"
  ON public.vendor_pos FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'vibe_admin'::app_role));

-- Add policy for vibe_admin to update vendor POs
CREATE POLICY "Vibe admins can update vendor POs"
  ON public.vendor_pos FOR UPDATE
  USING (has_role(auth.uid(), 'vibe_admin'::app_role));

-- Add policy for vibe_admin to create vendor PO items
CREATE POLICY "Vibe admins can create vendor PO items"
  ON public.vendor_po_items FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'vibe_admin'::app_role));

-- Add policy for vibe_admin to view vendor PO items
CREATE POLICY "Vibe admins can view vendor PO items"
  ON public.vendor_po_items FOR SELECT
  USING (has_role(auth.uid(), 'vibe_admin'::app_role));