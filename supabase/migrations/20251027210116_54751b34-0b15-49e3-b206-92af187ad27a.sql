-- Add QuickBooks sync tracking columns to products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS quickbooks_id text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS quickbooks_synced_at timestamp with time zone;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS quickbooks_sync_status text DEFAULT 'pending';

-- Add QuickBooks sync tracking columns to invoices
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS quickbooks_id text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS quickbooks_synced_at timestamp with time zone;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS quickbooks_sync_status text DEFAULT 'pending';

-- Add QuickBooks sync tracking columns to vendor_pos
ALTER TABLE public.vendor_pos ADD COLUMN IF NOT EXISTS quickbooks_id text;
ALTER TABLE public.vendor_pos ADD COLUMN IF NOT EXISTS quickbooks_synced_at timestamp with time zone;
ALTER TABLE public.vendor_pos ADD COLUMN IF NOT EXISTS quickbooks_sync_status text DEFAULT 'pending';

-- Create a table to store QuickBooks OAuth tokens and settings
CREATE TABLE IF NOT EXISTS public.quickbooks_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  realm_id text NOT NULL,
  access_token text,
  refresh_token text,
  token_expires_at timestamp with time zone,
  is_connected boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(company_id)
);

-- Enable RLS on quickbooks_settings
ALTER TABLE public.quickbooks_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies for quickbooks_settings
CREATE POLICY "Admins can view company QuickBooks settings"
  ON public.quickbooks_settings FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) AND company_id = get_user_company(auth.uid()));

CREATE POLICY "Admins can insert company QuickBooks settings"
  ON public.quickbooks_settings FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND company_id = get_user_company(auth.uid()));

CREATE POLICY "Admins can update company QuickBooks settings"
  ON public.quickbooks_settings FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role) AND company_id = get_user_company(auth.uid()));

-- Add trigger to update updated_at
CREATE TRIGGER update_quickbooks_settings_updated_at
  BEFORE UPDATE ON public.quickbooks_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_products_quickbooks_sync ON public.products(quickbooks_sync_status, quickbooks_synced_at);
CREATE INDEX IF NOT EXISTS idx_invoices_quickbooks_sync ON public.invoices(quickbooks_sync_status, quickbooks_synced_at);
CREATE INDEX IF NOT EXISTS idx_vendor_pos_quickbooks_sync ON public.vendor_pos(quickbooks_sync_status, quickbooks_synced_at);