-- Add quote_id to orders table to track source quote
ALTER TABLE public.orders 
ADD COLUMN quote_id uuid REFERENCES public.quotes(id);

-- Add quote_id to invoices table to track source quote
ALTER TABLE public.invoices 
ADD COLUMN quote_id uuid REFERENCES public.quotes(id);

-- Add index for faster lookups
CREATE INDEX idx_orders_quote_id ON public.orders(quote_id);
CREATE INDEX idx_invoices_quote_id ON public.invoices(quote_id);