
-- Drop the old restrictive SELECT policy for regular users
DROP POLICY IF EXISTS "Users can view company payments" ON public.payments;

-- Create a new SELECT policy using user_has_company_access for multi-company support
CREATE POLICY "Users can view company payments"
  ON public.payments
  FOR SELECT
  USING (user_has_company_access(auth.uid(), company_id));
