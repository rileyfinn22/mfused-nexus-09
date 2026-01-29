-- Create a function to check if user has access to a specific company
-- This is needed for multi-company access support
CREATE OR REPLACE FUNCTION public.user_has_company_access(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND company_id = _company_id
  )
$$;

-- Update get_user_companies to return ALL companies a user has access to
CREATE OR REPLACE FUNCTION public.get_user_companies(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id
  FROM public.user_roles
  WHERE user_id = _user_id
$$;

-- Update RLS policies to use the new function for multi-company support

-- ORDERS: Update SELECT policies
DROP POLICY IF EXISTS "Company members can view company orders" ON public.orders;
CREATE POLICY "Company members can view company orders"
ON public.orders FOR SELECT
USING (
  (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'company') OR has_role(auth.uid(), 'customer'))
  AND user_has_company_access(auth.uid(), company_id)
  AND (status <> 'draft' OR created_by = auth.uid())
);

-- INVOICES: Update SELECT policy
DROP POLICY IF EXISTS "Users can view company invoices" ON public.invoices;
CREATE POLICY "Users can view company invoices"
ON public.invoices FOR SELECT
USING (user_has_company_access(auth.uid(), company_id));

-- INVOICES: Update UPDATE policy
DROP POLICY IF EXISTS "Admins can update company invoices" ON public.invoices;
CREATE POLICY "Admins can update company invoices"
ON public.invoices FOR UPDATE
USING (
  has_role(auth.uid(), 'admin')
  AND user_has_company_access(auth.uid(), company_id)
);

-- INVOICES: Update DELETE policy
DROP POLICY IF EXISTS "Admins can delete company invoices" ON public.invoices;
CREATE POLICY "Admins can delete company invoices"
ON public.invoices FOR DELETE
USING (
  has_role(auth.uid(), 'admin')
  AND user_has_company_access(auth.uid(), company_id)
);

-- INVENTORY: Update SELECT policy
DROP POLICY IF EXISTS "Users can view company inventory" ON public.inventory;
CREATE POLICY "Users can view company inventory"
ON public.inventory FOR SELECT
USING (user_has_company_access(auth.uid(), company_id));

-- INVENTORY: Update UPDATE policy
DROP POLICY IF EXISTS "Admins can update company inventory" ON public.inventory;
CREATE POLICY "Admins can update company inventory"
ON public.inventory FOR UPDATE
USING (
  has_role(auth.uid(), 'admin')
  AND user_has_company_access(auth.uid(), company_id)
);

-- INVENTORY: Update DELETE policy
DROP POLICY IF EXISTS "Admins can delete company inventory" ON public.inventory;
CREATE POLICY "Admins can delete company inventory"
ON public.inventory FOR DELETE
USING (
  has_role(auth.uid(), 'admin')
  AND user_has_company_access(auth.uid(), company_id)
);

-- PRODUCTS: Check and update policies
DROP POLICY IF EXISTS "Users can view company products" ON public.products;
CREATE POLICY "Users can view company products"
ON public.products FOR SELECT
USING (user_has_company_access(auth.uid(), company_id));

DROP POLICY IF EXISTS "Admins can update company products" ON public.products;
CREATE POLICY "Admins can update company products"
ON public.products FOR UPDATE
USING (
  has_role(auth.uid(), 'admin')
  AND user_has_company_access(auth.uid(), company_id)
);

DROP POLICY IF EXISTS "Admins can delete company products" ON public.products;
CREATE POLICY "Admins can delete company products"
ON public.products FOR DELETE
USING (
  has_role(auth.uid(), 'admin')
  AND user_has_company_access(auth.uid(), company_id)
);