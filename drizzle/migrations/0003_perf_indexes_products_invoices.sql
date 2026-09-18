CREATE INDEX IF NOT EXISTS idx_products_company_template ON public.products (company_id, template_id);
CREATE INDEX IF NOT EXISTS idx_invoices_company_active_created_at_desc ON public.invoices (company_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_active_created_at_desc ON public.invoices (created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_product_states_state ON public.product_states (state);