-- Create a function to associate a user with a company as a customer when accessing an invoice
CREATE OR REPLACE FUNCTION public.associate_customer_with_invoice(
  p_invoice_id uuid,
  p_user_email text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_invoice_exists boolean;
  v_existing_role text;
BEGIN
  -- Get the user ID from auth.users
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = p_user_email;
  
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;
  
  -- Get the company_id from the invoice
  SELECT company_id INTO v_company_id
  FROM invoices
  WHERE id = p_invoice_id AND deleted_at IS NULL;
  
  IF v_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invoice not found');
  END IF;
  
  -- Check if user already has a role in this company
  SELECT role INTO v_existing_role
  FROM user_roles
  WHERE user_id = v_user_id AND company_id = v_company_id;
  
  IF v_existing_role IS NOT NULL THEN
    -- User already has access to this company
    RETURN json_build_object('success', true, 'message', 'Already has access', 'company_id', v_company_id);
  END IF;
  
  -- Check if user has any other role (like vibe_admin)
  SELECT role INTO v_existing_role
  FROM user_roles
  WHERE user_id = v_user_id;
  
  IF v_existing_role = 'vibe_admin' THEN
    -- Vibe admins can access all invoices
    RETURN json_build_object('success', true, 'message', 'Admin access', 'company_id', v_company_id);
  END IF;
  
  -- Associate user with the company as a customer
  INSERT INTO user_roles (user_id, company_id, role)
  VALUES (v_user_id, v_company_id, 'customer');
  
  RETURN json_build_object('success', true, 'message', 'Customer role assigned', 'company_id', v_company_id);
END;
$$;