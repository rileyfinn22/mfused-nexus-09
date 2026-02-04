-- Fix order_items RLS policies to support multi-company users
-- Drop existing policies that use get_user_company (single company)
DROP POLICY IF EXISTS "Company members can view order items" ON public.order_items;

-- Create new policy using user_has_company_access (multi-company support)
CREATE POLICY "Company members can view order items" 
ON public.order_items 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM orders o 
    WHERE o.id = order_items.order_id 
    AND user_has_company_access(auth.uid(), o.company_id)
    AND (o.status <> 'draft' OR o.created_by = auth.uid())
  )
);

-- Fix inventory_allocations RLS policy
DROP POLICY IF EXISTS "Users can view company inventory allocations" ON public.inventory_allocations;

CREATE POLICY "Users can view company inventory allocations"
ON public.inventory_allocations
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE oi.id = inventory_allocations.order_item_id
    AND user_has_company_access(auth.uid(), o.company_id)
  )
);

-- Add storage policy for company role users to download po-documents for their company's orders
CREATE POLICY "Company users can view po-documents for their orders"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'po-documents'
  AND EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role IN ('company', 'customer')
  )
);