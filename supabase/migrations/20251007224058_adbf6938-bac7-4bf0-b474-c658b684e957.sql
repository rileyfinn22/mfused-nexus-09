-- Create a function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_company_id uuid;
  company_name_meta text;
BEGIN
  -- Get company name from user metadata
  company_name_meta := NEW.raw_user_meta_data->>'company_name';
  
  -- Only proceed if company name is provided
  IF company_name_meta IS NOT NULL AND company_name_meta != '' THEN
    -- Create the company
    INSERT INTO public.companies (name)
    VALUES (company_name_meta)
    RETURNING id INTO new_company_id;
    
    -- Create the user role
    INSERT INTO public.user_roles (user_id, role, company_id)
    VALUES (NEW.id, 'admin', new_company_id);
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger to run after user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_signup();