-- Add 'deposit' as a valid invoice type
COMMENT ON COLUMN invoices.invoice_type IS 'Type of invoice: full, partial, final, or deposit';

-- Update any check constraints if they exist (most likely this is just a text field without constraints)