
-- Drop existing restrictive policies on customer_addresses
DROP POLICY IF EXISTS "Users can view company addresses" ON public.customer_addresses;
DROP POLICY IF EXISTS "Users can create company addresses" ON public.customer_addresses;
DROP POLICY IF EXISTS "Users can update company addresses" ON public.customer_addresses;
DROP POLICY IF EXISTS "Users can delete company addresses" ON public.customer_addresses;

-- Recreate as PERMISSIVE policies using user_has_company_access for multi-company support
CREATE POLICY "Users can view company addresses"
ON public.customer_addresses FOR SELECT
TO authenticated
USING (user_has_company_access(auth.uid(), company_id));

CREATE POLICY "Users can create company addresses"
ON public.customer_addresses FOR INSERT
TO authenticated
WITH CHECK (user_has_company_access(auth.uid(), company_id));

CREATE POLICY "Users can update company addresses"
ON public.customer_addresses FOR UPDATE
TO authenticated
USING (user_has_company_access(auth.uid(), company_id));

CREATE POLICY "Users can delete company addresses"
ON public.customer_addresses FOR DELETE
TO authenticated
USING (user_has_company_access(auth.uid(), company_id));

-- Also fix vibe admin policies to be PERMISSIVE
DROP POLICY IF EXISTS "Vibe admins can view all addresses" ON public.customer_addresses;
DROP POLICY IF EXISTS "Vibe admins can create all addresses" ON public.customer_addresses;
DROP POLICY IF EXISTS "Vibe admins can update all addresses" ON public.customer_addresses;
DROP POLICY IF EXISTS "Vibe admins can delete all addresses" ON public.customer_addresses;

CREATE POLICY "Vibe admins can view all addresses"
ON public.customer_addresses FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'vibe_admin'::app_role));

CREATE POLICY "Vibe admins can create all addresses"
ON public.customer_addresses FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'vibe_admin'::app_role));

CREATE POLICY "Vibe admins can update all addresses"
ON public.customer_addresses FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'vibe_admin'::app_role));

CREATE POLICY "Vibe admins can delete all addresses"
ON public.customer_addresses FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'vibe_admin'::app_role));
