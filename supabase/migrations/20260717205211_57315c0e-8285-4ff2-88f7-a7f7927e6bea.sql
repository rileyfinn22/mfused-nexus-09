-- Targeted performance indexes for slow portal data loads
-- These do not change permissions or business logic.

CREATE INDEX IF NOT EXISTS idx_products_template_id
ON public.products (template_id)
WHERE template_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_company_name
ON public.products (company_id, name);

CREATE INDEX IF NOT EXISTS idx_products_created_at_desc
ON public.products (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_states_product_id
ON public.product_states (product_id);

CREATE INDEX IF NOT EXISTS idx_artwork_files_sku_created_at_desc
ON public.artwork_files (sku, created_at DESC)
WHERE sku IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_artwork_files_sku_approved
ON public.artwork_files (sku, is_approved)
WHERE sku IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_quickbooks_id
ON public.invoices (quickbooks_id)
WHERE quickbooks_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_qbo_pending_invoice
ON public.payments (quickbooks_sync_status, quickbooks_id, invoice_id)
WHERE quickbooks_sync_status = 'pending' AND quickbooks_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_print_templates_created_at_desc
ON public.print_templates (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_active_created_at_desc
ON public.orders (created_at DESC)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_orders_company_active_created_at_desc
ON public.orders (company_id, created_at DESC)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_allocations_invoice_id
ON public.inventory_allocations (invoice_id);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id
ON public.user_roles (user_id);

CREATE INDEX IF NOT EXISTS idx_quickbooks_settings_company_id
ON public.quickbooks_settings (company_id);

CREATE INDEX IF NOT EXISTS idx_inventory_product_id
ON public.inventory (product_id);

CREATE INDEX IF NOT EXISTS idx_product_templates_name
ON public.product_templates (name);