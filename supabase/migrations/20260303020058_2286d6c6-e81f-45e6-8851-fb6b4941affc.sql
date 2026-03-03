
-- Allow company users to create workshop orders for their company
CREATE POLICY "Company users can create workshop orders"
ON public.workshop_orders
FOR INSERT
TO authenticated
WITH CHECK (
  company_id IN (
    SELECT ur.company_id FROM user_roles ur WHERE ur.user_id = auth.uid()
  )
);

-- Allow company users to view their own company's workshop orders
CREATE POLICY "Company users can view their workshop orders"
ON public.workshop_orders
FOR SELECT
TO authenticated
USING (
  company_id IN (
    SELECT ur.company_id FROM user_roles ur WHERE ur.user_id = auth.uid()
  )
);

-- Allow company users to create print order line items for their company
CREATE POLICY "Company users can create print orders"
ON public.print_orders
FOR INSERT
TO authenticated
WITH CHECK (
  company_id IN (
    SELECT ur.company_id FROM user_roles ur WHERE ur.user_id = auth.uid()
  )
);

-- Allow company users to view their own company's print orders
CREATE POLICY "Company users can view their print orders"
ON public.print_orders
FOR SELECT
TO authenticated
USING (
  company_id IN (
    SELECT ur.company_id FROM user_roles ur WHERE ur.user_id = auth.uid()
  )
);

-- Allow company users to view print templates (needed to browse the shop)
CREATE POLICY "Authenticated users can view print templates"
ON public.print_templates
FOR SELECT
TO authenticated
USING (true);
