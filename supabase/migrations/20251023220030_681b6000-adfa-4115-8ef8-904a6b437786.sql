-- Add invoice_number column to inventory table for direct invoice-to-inventory linking
ALTER TABLE public.inventory
ADD COLUMN invoice_number text;

-- Create index for faster lookup by invoice number
CREATE INDEX idx_inventory_invoice_number ON public.inventory(invoice_number) WHERE invoice_number IS NOT NULL;

-- Add comment explaining the column
COMMENT ON COLUMN public.inventory.invoice_number IS 'Invoice number from fulfillment partner upload - links uploaded inventory directly to the invoice it fulfills';