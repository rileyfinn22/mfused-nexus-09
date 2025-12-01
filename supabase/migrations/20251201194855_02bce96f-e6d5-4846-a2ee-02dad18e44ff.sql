-- Add soft delete capability to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone;

-- Add index for better query performance on non-deleted orders
CREATE INDEX IF NOT EXISTS idx_orders_deleted_at ON public.orders(deleted_at) WHERE deleted_at IS NULL;

-- Add index for better query performance on non-deleted invoices
CREATE INDEX IF NOT EXISTS idx_invoices_deleted_at ON public.invoices(deleted_at) WHERE deleted_at IS NULL;