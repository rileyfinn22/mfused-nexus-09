-- Drop the problematic recursive policy
DROP POLICY IF EXISTS "Users can view child orders of their company orders" ON orders;

-- Create a security definer function to check parent order access
CREATE OR REPLACE FUNCTION public.can_view_child_order(_order_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM orders child
    JOIN orders parent ON child.parent_order_id = parent.id
    WHERE child.id = _order_id
      AND parent.company_id = get_user_company(_user_id)
  )
$$;

-- Recreate the policy using the security definer function
CREATE POLICY "Users can view child orders of their company orders"
ON orders
FOR SELECT
USING (can_view_child_order(id, auth.uid()));