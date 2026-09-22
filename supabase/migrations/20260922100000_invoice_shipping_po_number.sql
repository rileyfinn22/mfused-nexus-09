-- Link the shipping line on an invoice to the vendor PO the freight was bought on.
--
-- Vibe admins pick a real vendor PO from the system (not a typed number) so the shipping
-- charge billed to the customer is tied to the PO that paid for it. Internal only: vendor POs
-- never surface to customers, so this drives nothing on the customer page, the PDF, or the
-- QuickBooks line. Customers cannot read vendor_pos (RLS), so the bare id on the invoice row
-- reveals nothing.

alter table public.invoices
  add column if not exists shipping_vendor_po_id uuid references public.vendor_pos(id) on delete set null;

create index if not exists invoices_shipping_vendor_po_id_idx on public.invoices (shipping_vendor_po_id);
