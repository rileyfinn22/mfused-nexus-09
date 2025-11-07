-- Add parent_invoice_id to link shipment invoices to blanket/deposit invoices
ALTER TABLE invoices ADD COLUMN parent_invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL;