-- Enable pgsodium extension for encryption
CREATE EXTENSION IF NOT EXISTS pgsodium;

-- Create helper function to store encrypted QuickBooks tokens in vault
CREATE OR REPLACE FUNCTION public.store_qb_token_encrypted(
  p_company_id uuid,
  p_token_type text,
  p_token_value text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgsodium
AS $$
DECLARE
  v_secret_id uuid;
  v_secret_name text;
BEGIN
  -- Create unique secret name
  v_secret_name := 'qb_' || p_token_type || '_' || p_company_id::text;
  
  -- Store in vault
  v_secret_id := pgsodium.create_secret(p_token_value, v_secret_name);
  
  RETURN v_secret_id;
END;
$$;

-- Create helper function to retrieve encrypted QuickBooks tokens from vault
CREATE OR REPLACE FUNCTION public.get_qb_token_decrypted(
  p_company_id uuid,
  p_token_type text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgsodium
AS $$
DECLARE
  v_secret_name text;
  v_decrypted_value text;
BEGIN
  -- Construct secret name
  v_secret_name := 'qb_' || p_token_type || '_' || p_company_id::text;
  
  -- Retrieve and decrypt from vault
  SELECT decrypted_secret INTO v_decrypted_value
  FROM pgsodium.decrypted_secrets
  WHERE name = v_secret_name;
  
  RETURN v_decrypted_value;
END;
$$;

-- Add columns to track vault secret IDs instead of storing tokens directly
ALTER TABLE public.quickbooks_settings 
ADD COLUMN IF NOT EXISTS access_token_secret_id uuid,
ADD COLUMN IF NOT EXISTS refresh_token_secret_id uuid;

-- Migrate existing tokens to vault (if any exist)
-- Note: This will only work for tokens that currently exist in plain text
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id, company_id, access_token, refresh_token 
           FROM public.quickbooks_settings 
           WHERE access_token IS NOT NULL
  LOOP
    -- Store access token in vault
    IF r.access_token IS NOT NULL THEN
      UPDATE public.quickbooks_settings
      SET access_token_secret_id = public.store_qb_token_encrypted(
        r.company_id,
        'access',
        r.access_token
      )
      WHERE id = r.id;
    END IF;
    
    -- Store refresh token in vault
    IF r.refresh_token IS NOT NULL THEN
      UPDATE public.quickbooks_settings
      SET refresh_token_secret_id = public.store_qb_token_encrypted(
        r.company_id,
        'refresh',
        r.refresh_token
      )
      WHERE id = r.id;
    END IF;
  END LOOP;
END $$;

-- Remove plain text token columns (keeping them temporarily for backwards compatibility)
-- After edge functions are updated, these columns can be dropped:
-- ALTER TABLE public.quickbooks_settings DROP COLUMN access_token;
-- ALTER TABLE public.quickbooks_settings DROP COLUMN refresh_token;

-- Add comment explaining the new structure
COMMENT ON COLUMN public.quickbooks_settings.access_token_secret_id IS 'Reference to encrypted access token in pgsodium vault';
COMMENT ON COLUMN public.quickbooks_settings.refresh_token_secret_id IS 'Reference to encrypted refresh token in pgsodium vault';