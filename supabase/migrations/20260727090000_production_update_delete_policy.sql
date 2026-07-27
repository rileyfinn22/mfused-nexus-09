-- Vendors sometimes attach the wrong file and need to delete + re-upload.
-- Vendors may delete only updates THEY created on their own POs; vibe_admin
-- may delete any (mirrors the table's INSERT/SELECT policies).

DROP POLICY IF EXISTS "Vendors and admins delete their production updates" ON public.vendor_po_production_updates;
CREATE POLICY "Vendors and admins delete their production updates"
ON public.vendor_po_production_updates
FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'vibe_admin'::app_role)
  OR (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.vendor_pos p
      JOIN public.vendors v ON v.id = p.vendor_id
      WHERE p.id = vendor_po_production_updates.vendor_po_id
        AND v.user_id = auth.uid()
    )
  )
);
