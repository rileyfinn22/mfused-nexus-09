-- Customer PO number for the shipping line on an invoice.
--
-- Some customers issue a separate PO for freight, distinct from the product PO already held in
-- invoices.customer_po_number. The Shipping line on the invoice page and PDF, and the Shipping
-- line sent to QuickBooks, show it alongside the existing free-text shipping_note.

alter table public.invoices
  add column if not exists shipping_po_number text;
