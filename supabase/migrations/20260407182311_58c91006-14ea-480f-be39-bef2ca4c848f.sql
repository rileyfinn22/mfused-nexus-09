-- 1. Fix vendor_invitations: Replace overly broad anon SELECT policy with secure RPC
DROP POLICY IF EXISTS "Public can view invitations by token" ON public.vendor_invitations;

-- Create a secure RPC function to validate vendor invitations by token
CREATE OR REPLACE FUNCTION public.validate_vendor_invitation(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  inv_record RECORD;
BEGIN
  SELECT vi.*, v.name as vendor_name
  INTO inv_record
  FROM public.vendor_invitations vi
  LEFT JOIN public.vendors v ON vi.vendor_id = v.id
  WHERE vi.invitation_token = p_token
    AND vi.status = 'pending'
    AND vi.expires_at > now();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Invitation is invalid or has expired');
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'email', inv_record.email,
    'vendor_name', inv_record.vendor_name,
    'vendor_id', inv_record.vendor_id,
    'company_id', inv_record.company_id
  );
END;
$$;

-- Grant execute to anon and authenticated
GRANT EXECUTE ON FUNCTION public.validate_vendor_invitation(text) TO anon;
GRANT EXECUTE ON FUNCTION public.validate_vendor_invitation(text) TO authenticated;

-- 2. Fix shipment_share_links: Replace overly broad public SELECT policy with secure RPC
DROP POLICY IF EXISTS "Anyone can select share link by token" ON public.shipment_share_links;

-- Create a secure RPC function to validate shipment share link token
CREATE OR REPLACE FUNCTION public.validate_shipment_share_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  link_record RECORD;
BEGIN
  SELECT *
  INTO link_record
  FROM public.shipment_share_links
  WHERE token = p_token
    AND is_active = true
    AND expires_at > now();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Invalid or expired link');
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'order_ids', link_record.order_ids,
    'company_id', link_record.company_id,
    'label', link_record.label
  );
END;
$$;

-- Grant execute to anon and authenticated (public shipment update pages use this)
GRANT EXECUTE ON FUNCTION public.validate_shipment_share_token(text) TO anon;
GRANT EXECUTE ON FUNCTION public.validate_shipment_share_token(text) TO authenticated;

-- 3. Fix po-documents storage: Restrict to vibe_admin only
DROP POLICY IF EXISTS "Company users can view po-documents for their orders" ON storage.objects;

CREATE POLICY "Only vibe_admin can view po-documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'po-documents' AND
  auth.uid() IS NOT NULL AND
  has_role(auth.uid(), 'vibe_admin'::app_role)
);

-- 4. Fix quote-documents storage: Make private and restrict access
UPDATE storage.buckets 
SET public = false 
WHERE id = 'quote-documents';

DROP POLICY IF EXISTS "Anyone can view quote documents" ON storage.objects;

CREATE POLICY "Authenticated users can view quote documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'quote-documents' AND
  auth.uid() IS NOT NULL AND
  (
    has_role(auth.uid(), 'vibe_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
    )
  )
);