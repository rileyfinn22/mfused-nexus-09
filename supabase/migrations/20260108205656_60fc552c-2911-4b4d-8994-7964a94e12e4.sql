-- Fix: orders table is missing created_by, which we need to hide internal drafts from companies.

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS created_by uuid;

CREATE INDEX IF NOT EXISTS idx_orders_created_by ON public.orders(created_by);

-- Tighten order visibility/edit rules so company users cannot see Vibe-created drafts
-- and only edit their own draft orders.

-- ORDERS
DROP POLICY IF EXISTS "Users can view company orders" ON public.orders;
DROP POLICY IF EXISTS "Users can view child orders of their company orders" ON public.orders;
DROP POLICY IF EXISTS "Users can create company orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can update company orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can delete company orders" ON public.orders;

-- Company members (admin/company/customer) can view company orders,
-- but drafts are only visible to the creator.
CREATE POLICY "Company members can view company orders"
ON public.orders
FOR SELECT
TO authenticated
USING (
  (public.has_role(auth.uid(), 'admin'::public.app_role)
   OR public.has_role(auth.uid(), 'company'::public.app_role)
   OR public.has_role(auth.uid(), 'customer'::public.app_role))
  AND company_id = public.get_user_company(auth.uid())
  AND (
    status <> 'draft'
    OR created_by = auth.uid()
  )
);

-- Child orders: same draft restriction.
CREATE POLICY "Company members can view child orders"
ON public.orders
FOR SELECT
TO authenticated
USING (
  public.can_view_child_order(id, auth.uid())
  AND (
    status <> 'draft'
    OR created_by = auth.uid()
  )
);

-- Company members can create orders for their company.
-- Drafts/pending must be attributed to the creator.
CREATE POLICY "Company members can create orders"
ON public.orders
FOR INSERT
TO authenticated
WITH CHECK (
  (public.has_role(auth.uid(), 'admin'::public.app_role)
   OR public.has_role(auth.uid(), 'company'::public.app_role))
  AND company_id = public.get_user_company(auth.uid())
  AND created_by = auth.uid()
  AND status IN ('draft', 'pending')
);

-- Company members can update ONLY their own draft orders (e.g., to push to pending).
CREATE POLICY "Company members can update own draft orders"
ON public.orders
FOR UPDATE
TO authenticated
USING (
  (public.has_role(auth.uid(), 'admin'::public.app_role)
   OR public.has_role(auth.uid(), 'company'::public.app_role))
  AND company_id = public.get_user_company(auth.uid())
  AND created_by = auth.uid()
  AND status = 'draft'
)
WITH CHECK (
  (public.has_role(auth.uid(), 'admin'::public.app_role)
   OR public.has_role(auth.uid(), 'company'::public.app_role))
  AND company_id = public.get_user_company(auth.uid())
  AND created_by = auth.uid()
  AND status IN ('draft', 'pending')
);

-- Company members can delete ONLY their own draft orders.
CREATE POLICY "Company members can delete own draft orders"
ON public.orders
FOR DELETE
TO authenticated
USING (
  (public.has_role(auth.uid(), 'admin'::public.app_role)
   OR public.has_role(auth.uid(), 'company'::public.app_role))
  AND company_id = public.get_user_company(auth.uid())
  AND created_by = auth.uid()
  AND status = 'draft'
);


-- ORDER_ITEMS
DROP POLICY IF EXISTS "Users can view order items" ON public.order_items;
DROP POLICY IF EXISTS "Users can create order items" ON public.order_items;
DROP POLICY IF EXISTS "Admins can update company order items" ON public.order_items;
DROP POLICY IF EXISTS "Admins can delete company order items" ON public.order_items;

-- Company members can view order items for orders they can view.
CREATE POLICY "Company members can view order items"
ON public.order_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = order_items.order_id
      AND o.company_id = public.get_user_company(auth.uid())
      AND (
        o.status <> 'draft'
        OR o.created_by = auth.uid()
      )
  )
);

-- Company members can create order items ONLY on their own draft orders.
CREATE POLICY "Company members can create order items in own draft orders"
ON public.order_items
FOR INSERT
TO authenticated
WITH CHECK (
  (public.has_role(auth.uid(), 'admin'::public.app_role)
   OR public.has_role(auth.uid(), 'company'::public.app_role))
  AND EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = order_items.order_id
      AND o.company_id = public.get_user_company(auth.uid())
      AND o.status = 'draft'
      AND o.created_by = auth.uid()
  )
);

-- Company members can update order items ONLY on their own draft orders.
CREATE POLICY "Company members can update order items in own draft orders"
ON public.order_items
FOR UPDATE
TO authenticated
USING (
  (public.has_role(auth.uid(), 'admin'::public.app_role)
   OR public.has_role(auth.uid(), 'company'::public.app_role))
  AND EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = order_items.order_id
      AND o.company_id = public.get_user_company(auth.uid())
      AND o.status = 'draft'
      AND o.created_by = auth.uid()
  )
)
WITH CHECK (
  (public.has_role(auth.uid(), 'admin'::public.app_role)
   OR public.has_role(auth.uid(), 'company'::public.app_role))
  AND EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = order_items.order_id
      AND o.company_id = public.get_user_company(auth.uid())
      AND o.status = 'draft'
      AND o.created_by = auth.uid()
  )
);

-- Company members can delete order items ONLY on their own draft orders.
CREATE POLICY "Company members can delete order items in own draft orders"
ON public.order_items
FOR DELETE
TO authenticated
USING (
  (public.has_role(auth.uid(), 'admin'::public.app_role)
   OR public.has_role(auth.uid(), 'company'::public.app_role))
  AND EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = order_items.order_id
      AND o.company_id = public.get_user_company(auth.uid())
      AND o.status = 'draft'
      AND o.created_by = auth.uid()
  )
);
