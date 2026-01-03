-- Add vibe_admin policies for customer_addresses table
CREATE POLICY "Vibe admins can view all addresses" 
ON public.customer_addresses 
FOR SELECT 
USING (has_role(auth.uid(), 'vibe_admin'));

CREATE POLICY "Vibe admins can create all addresses" 
ON public.customer_addresses 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'vibe_admin'));

CREATE POLICY "Vibe admins can update all addresses" 
ON public.customer_addresses 
FOR UPDATE 
USING (has_role(auth.uid(), 'vibe_admin'));

CREATE POLICY "Vibe admins can delete all addresses" 
ON public.customer_addresses 
FOR DELETE 
USING (has_role(auth.uid(), 'vibe_admin'));