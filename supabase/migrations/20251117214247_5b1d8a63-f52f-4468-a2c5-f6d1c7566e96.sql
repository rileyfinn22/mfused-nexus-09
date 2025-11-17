-- Add QuickBooks sync fields to payments table
ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS quickbooks_id text,
ADD COLUMN IF NOT EXISTS quickbooks_sync_status text DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS quickbooks_synced_at timestamp with time zone;