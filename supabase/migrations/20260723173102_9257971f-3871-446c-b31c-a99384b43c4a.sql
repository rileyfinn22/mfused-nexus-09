ALTER TABLE public.vendor_po_items ALTER COLUMN shipped_quantity DROP NOT NULL;
ALTER TABLE public.vendor_po_items ALTER COLUMN shipped_quantity DROP DEFAULT;