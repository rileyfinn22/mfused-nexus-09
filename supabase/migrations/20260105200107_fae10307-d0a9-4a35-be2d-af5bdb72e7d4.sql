-- Add stable line ordering for order items
ALTER TABLE public.order_items
ADD COLUMN IF NOT EXISTS line_number integer;

-- Backfill line numbers for existing orders using original creation order
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (PARTITION BY order_id ORDER BY created_at ASC, id ASC) AS rn
  FROM public.order_items
)
UPDATE public.order_items oi
SET line_number = ranked.rn
FROM ranked
WHERE oi.id = ranked.id
  AND oi.line_number IS NULL;

-- Ensure line numbers are unique per order
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'order_items_order_id_line_number_key'
  ) THEN
    ALTER TABLE public.order_items
    ADD CONSTRAINT order_items_order_id_line_number_key UNIQUE (order_id, line_number);
  END IF;
END$$;

-- Auto-assign line_number for new inserts if not provided
CREATE OR REPLACE FUNCTION public.set_order_item_line_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.line_number IS NULL THEN
    SELECT COALESCE(MAX(line_number), 0) + 1
    INTO NEW.line_number
    FROM public.order_items
    WHERE order_id = NEW.order_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_order_item_line_number ON public.order_items;
CREATE TRIGGER trg_set_order_item_line_number
BEFORE INSERT ON public.order_items
FOR EACH ROW
EXECUTE FUNCTION public.set_order_item_line_number();

-- Helpful index for fast ordered fetches
CREATE INDEX IF NOT EXISTS idx_order_items_order_line
ON public.order_items (order_id, line_number);