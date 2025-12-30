
-- Add vendor quote workflow fields to quotes table
ALTER TABLE public.quotes 
ADD COLUMN vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
ADD COLUMN vendor_sent_at timestamp with time zone DEFAULT NULL,
ADD COLUMN vendor_response_received_at timestamp with time zone DEFAULT NULL,
ADD COLUMN vendor_quote_notes text DEFAULT NULL;

-- Add index for vendor lookups
CREATE INDEX idx_quotes_vendor_id ON public.quotes(vendor_id);
