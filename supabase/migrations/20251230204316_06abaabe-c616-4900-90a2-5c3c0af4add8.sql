-- Add price_breaks column to quote_items for tiered pricing
ALTER TABLE public.quote_items 
ADD COLUMN price_breaks jsonb DEFAULT '[]'::jsonb;

-- Add selected_tier column to track which tier the customer chose
ALTER TABLE public.quote_items 
ADD COLUMN selected_tier integer DEFAULT NULL;

COMMENT ON COLUMN public.quote_items.price_breaks IS 'Array of price tiers: [{min_qty: number, max_qty: number|null, unit_price: number}]';
COMMENT ON COLUMN public.quote_items.selected_tier IS 'Index of the selected price tier from price_breaks array';