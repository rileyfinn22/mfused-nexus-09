-- Drop existing policies on order_attachments
DROP POLICY IF EXISTS "Users can create order attachments for their company orders" ON public.order_attachments;
DROP POLICY IF EXISTS "Users can view order attachments for their company orders" ON public.order_attachments;
DROP POLICY IF EXISTS "Users can delete order attachments for their company orders" ON public.order_attachments;

-- Create updated policies that include vibe_admin access
CREATE POLICY "Users can view order attachments"
ON public.order_attachments
FOR SELECT
USING (
  has_role(auth.uid(), 'vibe_admin')
  OR EXISTS (
    SELECT 1 FROM orders o
    JOIN user_roles ur ON ur.company_id = o.company_id
    WHERE o.id = order_attachments.order_id AND ur.user_id = auth.uid()
  )
);

CREATE POLICY "Users can create order attachments"
ON public.order_attachments
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'vibe_admin')
  OR EXISTS (
    SELECT 1 FROM orders o
    JOIN user_roles ur ON ur.company_id = o.company_id
    WHERE o.id = order_attachments.order_id AND ur.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete order attachments"
ON public.order_attachments
FOR DELETE
USING (
  has_role(auth.uid(), 'vibe_admin')
  OR EXISTS (
    SELECT 1 FROM orders o
    JOIN user_roles ur ON ur.company_id = o.company_id
    WHERE o.id = order_attachments.order_id AND ur.user_id = auth.uid()
  )
);