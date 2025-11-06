-- Add error tracking and refresh token expiry to quickbooks_settings
ALTER TABLE quickbooks_settings 
ADD COLUMN IF NOT EXISTS last_error text,
ADD COLUMN IF NOT EXISTS last_error_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS refresh_token_expires_at timestamp with time zone;

-- Enable pg_cron extension for scheduled token refresh
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Enable pg_net extension for making HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- Create the cron job to refresh QuickBooks tokens every 30 minutes
SELECT cron.schedule(
  'quickbooks-token-refresh',
  '*/30 * * * *', -- Every 30 minutes
  $$
  SELECT
    net.http_post(
      url := 'https://spxdyqdygsmzyngrqxni.supabase.co/functions/v1/quickbooks-refresh-tokens',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNweGR5cWR5Z3NtenluZ3JxeG5pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk3NjE5MTQsImV4cCI6MjA3NTMzNzkxNH0.SdfBMwipD6Ml89YbbR-Z4bu_iblYam4MAWu2ujy4OxA"}'::jsonb
    ) as request_id;
  $$
);