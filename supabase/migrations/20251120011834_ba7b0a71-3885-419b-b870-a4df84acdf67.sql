-- Add description field to invoices table
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS description TEXT;

-- Add description field to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS description TEXT;