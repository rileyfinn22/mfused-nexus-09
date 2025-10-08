-- Allow vibe_admin to view all companies' orders
CREATE POLICY "Vibe admins can view all orders"
ON public.orders
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'vibe_admin'));

-- Allow vibe_admin to update all companies' orders
CREATE POLICY "Vibe admins can update all orders"
ON public.orders
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'vibe_admin'));

-- Allow vibe_admin to view all companies' products
CREATE POLICY "Vibe admins can view all products"
ON public.products
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'vibe_admin'));

-- Allow vibe_admin to view all companies' inventory
CREATE POLICY "Vibe admins can view all inventory"
ON public.inventory
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'vibe_admin'));

-- Allow vibe_admin to update all companies' inventory
CREATE POLICY "Vibe admins can update all inventory"
ON public.inventory
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'vibe_admin'));

-- Allow vibe_admin to view all order items
CREATE POLICY "Vibe admins can view all order items"
ON public.order_items
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'vibe_admin'));

-- Allow vibe_admin to view all companies
CREATE POLICY "Vibe admins can view all companies"
ON public.companies
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'vibe_admin'));

-- Allow vibe_admin to view all artwork files
CREATE POLICY "Vibe admins can view all artwork"
ON public.artwork_files
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'vibe_admin'));

-- Allow vibe_admin to update all artwork files
CREATE POLICY "Vibe admins can update all artwork"
ON public.artwork_files
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'vibe_admin'));