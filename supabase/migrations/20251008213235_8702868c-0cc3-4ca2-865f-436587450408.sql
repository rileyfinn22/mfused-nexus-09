-- Add DELETE policies for vendor_po_items
CREATE POLICY "Admins can delete company vendor PO items"
ON public.vendor_po_items
FOR DELETE
USING (
  has_role(auth.uid(), 'admin'::app_role) AND
  EXISTS (
    SELECT 1 FROM vendor_pos
    WHERE vendor_pos.id = vendor_po_items.vendor_po_id
    AND vendor_pos.company_id = get_user_company(auth.uid())
  )
);

CREATE POLICY "Vibe admins can delete vendor PO items"
ON public.vendor_po_items
FOR DELETE
USING (has_role(auth.uid(), 'vibe_admin'::app_role));

-- Add DELETE policies for vendor_pos
CREATE POLICY "Admins can delete company vendor POs"
ON public.vendor_pos
FOR DELETE
USING (
  has_role(auth.uid(), 'admin'::app_role) AND
  company_id = get_user_company(auth.uid())
);

CREATE POLICY "Vibe admins can delete vendor POs"
ON public.vendor_pos
FOR DELETE
USING (has_role(auth.uid(), 'vibe_admin'::app_role));