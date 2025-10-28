-- Truncate existing invoice numbers that are too long for QuickBooks (max 21 chars)
UPDATE invoices 
SET invoice_number = SUBSTRING(invoice_number, 1, 21) 
WHERE LENGTH(invoice_number) > 21;