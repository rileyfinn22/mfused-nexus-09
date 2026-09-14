-- Allow company members to edit/withdraw their own customer-submitted orders
-- only while they are pending and not yet approved by a VibePKG admin.

CREATE POLICY "Company members can update own awaiting approval orders"
ON public.orders
FOR UPDATE
TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'company'::app_role))
  AND user_has_company_access(auth.uid(), company_id)
  AND status = 'pending'
  AND COALESCE(submitted_by_customer, false) = true
  AND COALESCE(vibe_approved, false) = false
)
WITH CHECK (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'company'::app_role))
  AND user_has_company_access(auth.uid(), company_id)
  AND status = 'pending'
  AND COALESCE(submitted_by_customer, false) = true
  AND COALESCE(vibe_approved, false) = false
);

CREATE POLICY "Company members can update items on awaiting approval orders"
ON public.order_items
FOR UPDATE
TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'company'::app_role))
  AND EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND user_has_company_access(auth.uid(), o.company_id)
      AND o.status = 'pending'
      AND COALESCE(o.submitted_by_customer, false) = true
      AND COALESCE(o.vibe_approved, false) = false
  )
)
WITH CHECK (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'company'::app_role))
  AND EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND user_has_company_access(auth.uid(), o.company_id)
      AND o.status = 'pending'
      AND COALESCE(o.submitted_by_customer, false) = true
      AND COALESCE(o.vibe_approved, false) = false
  )
);

CREATE POLICY "Company members can add items to awaiting approval orders"
ON public.order_items
FOR INSERT
TO authenticated
WITH CHECK (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'company'::app_role))
  AND EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND user_has_company_access(auth.uid(), o.company_id)
      AND o.status = 'pending'
      AND COALESCE(o.submitted_by_customer, false) = true
      AND COALESCE(o.vibe_approved, false) = false
  )
);

CREATE POLICY "Company members can remove items on awaiting approval orders"
ON public.order_items
FOR DELETE
TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'company'::app_role))
  AND EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND user_has_company_access(auth.uid(), o.company_id)
      AND o.status = 'pending'
      AND COALESCE(o.submitted_by_customer, false) = true
      AND COALESCE(o.vibe_approved, false) = false
  )
);
