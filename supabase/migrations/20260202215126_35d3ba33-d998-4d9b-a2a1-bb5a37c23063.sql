-- Drop the existing unique constraint that doesn't account for order_id
ALTER TABLE public.inventory DROP CONSTRAINT IF EXISTS inventory_company_id_sku_state_key;

-- Create new unique constraint that includes order_id
-- This allows same product (SKU) to exist in multiple orders within the same company/state
ALTER TABLE public.inventory ADD CONSTRAINT inventory_company_sku_state_order_key UNIQUE (company_id, sku, state, order_id);