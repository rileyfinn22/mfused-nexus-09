-- Add parent_quote_id to link response quotes to request quotes
ALTER TABLE public.quotes
ADD COLUMN parent_quote_id uuid REFERENCES public.quotes(id);

-- Create index for faster lookups
CREATE INDEX idx_quotes_parent_quote_id ON public.quotes(parent_quote_id);