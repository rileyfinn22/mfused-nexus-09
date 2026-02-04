-- Fix production_stages RLS policy for multi-company users
-- The current policy uses get_user_company() which returns only ONE company
-- This breaks for users with access to multiple companies

-- Drop the existing customer view policy
DROP POLICY IF EXISTS "Customers can view their company production stages" ON public.production_stages;

-- Create a new policy using user_has_company_access() which checks ALL companies the user has access to
CREATE POLICY "Customers can view their company production stages" 
ON public.production_stages 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM orders o 
    WHERE o.id = production_stages.order_id 
    AND user_has_company_access(auth.uid(), o.company_id)
  )
);

-- Fix production_stage_updates RLS policy for multi-company users
DROP POLICY IF EXISTS "Customers can view their company stage updates" ON public.production_stage_updates;

CREATE POLICY "Customers can view their company stage updates" 
ON public.production_stage_updates 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 
    FROM production_stages ps
    JOIN orders o ON ps.order_id = o.id
    WHERE ps.id = production_stage_updates.stage_id 
    AND user_has_company_access(auth.uid(), o.company_id)
  )
);

-- Fix production_stage_updates INSERT policy for multi-company users
DROP POLICY IF EXISTS "Authenticated users can create notes" ON public.production_stage_updates;

CREATE POLICY "Authenticated users can create notes" 
ON public.production_stage_updates 
FOR INSERT 
WITH CHECK (
  update_type = 'note' 
  AND EXISTS (
    SELECT 1 
    FROM production_stages ps
    JOIN orders o ON ps.order_id = o.id
    WHERE ps.id = production_stage_updates.stage_id 
    AND user_has_company_access(auth.uid(), o.company_id)
  )
);