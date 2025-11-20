-- Add field to store uploaded PO PDF path
ALTER TABLE orders
ADD COLUMN po_pdf_path TEXT;

COMMENT ON COLUMN orders.po_pdf_path IS 'Storage path to the uploaded purchase order PDF';