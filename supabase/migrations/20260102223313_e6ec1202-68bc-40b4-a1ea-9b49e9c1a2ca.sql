-- Remove company-level policies from vendor_pos (only vibe_admin should access)
DROP POLICY IF EXISTS "Admins can create company vendor POs" ON vendor_pos;
DROP POLICY IF EXISTS "Admins can delete company vendor POs" ON vendor_pos;
DROP POLICY IF EXISTS "Admins can update company vendor POs" ON vendor_pos;
DROP POLICY IF EXISTS "Users can view company vendor POs" ON vendor_pos;

-- Remove company-level policies from vendor_po_items (only vibe_admin should access)
DROP POLICY IF EXISTS "Admins can create vendor PO items" ON vendor_po_items;
DROP POLICY IF EXISTS "Admins can delete company vendor PO items" ON vendor_po_items;
DROP POLICY IF EXISTS "Users can view vendor PO items" ON vendor_po_items;

-- Add update policy for vibe_admin on vendor_po_items (was missing)
CREATE POLICY "Vibe admins can update vendor PO items"
ON vendor_po_items
FOR UPDATE
USING (has_role(auth.uid(), 'vibe_admin'::app_role));