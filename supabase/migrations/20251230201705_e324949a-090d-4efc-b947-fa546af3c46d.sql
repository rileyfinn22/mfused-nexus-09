-- Create quotes table
CREATE TABLE public.quotes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL REFERENCES public.companies(id),
    quote_number text NOT NULL,
    status text NOT NULL DEFAULT 'draft',
    
    -- Customer info
    customer_name text NOT NULL,
    customer_email text,
    customer_phone text,
    
    -- Shipping address
    shipping_name text,
    shipping_street text,
    shipping_city text,
    shipping_state text,
    shipping_zip text,
    
    -- Quote details
    description text,
    request_notes text,
    internal_notes text,
    terms text DEFAULT 'Net 30',
    valid_until timestamp with time zone,
    
    -- File upload for customer requests
    uploaded_file_url text,
    uploaded_filename text,
    
    -- Pricing
    subtotal numeric NOT NULL DEFAULT 0,
    tax numeric NOT NULL DEFAULT 0,
    shipping_cost numeric NOT NULL DEFAULT 0,
    total numeric NOT NULL DEFAULT 0,
    
    -- Tracking
    requested_by uuid,
    created_by uuid,
    approved_at timestamp with time zone,
    approved_by uuid,
    sent_at timestamp with time zone,
    
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create quote_items table
CREATE TABLE public.quote_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id),
    sku text NOT NULL,
    name text NOT NULL,
    description text,
    state text,
    quantity integer NOT NULL DEFAULT 1,
    unit_price numeric NOT NULL DEFAULT 0,
    total numeric NOT NULL DEFAULT 0,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;

-- Quotes policies
CREATE POLICY "Users can view company quotes"
ON public.quotes FOR SELECT
USING (company_id = get_user_company(auth.uid()));

CREATE POLICY "Vibe admins can view all quotes"
ON public.quotes FOR SELECT
USING (has_role(auth.uid(), 'vibe_admin'));

CREATE POLICY "Users can create company quotes"
ON public.quotes FOR INSERT
WITH CHECK (company_id = get_user_company(auth.uid()));

CREATE POLICY "Vibe admins can create all quotes"
ON public.quotes FOR INSERT
WITH CHECK (has_role(auth.uid(), 'vibe_admin'));

CREATE POLICY "Admins can update company quotes"
ON public.quotes FOR UPDATE
USING (has_role(auth.uid(), 'admin') AND company_id = get_user_company(auth.uid()));

CREATE POLICY "Vibe admins can update all quotes"
ON public.quotes FOR UPDATE
USING (has_role(auth.uid(), 'vibe_admin'));

CREATE POLICY "Admins can delete company quotes"
ON public.quotes FOR DELETE
USING (has_role(auth.uid(), 'admin') AND company_id = get_user_company(auth.uid()));

CREATE POLICY "Vibe admins can delete all quotes"
ON public.quotes FOR DELETE
USING (has_role(auth.uid(), 'vibe_admin'));

-- Quote items policies
CREATE POLICY "Users can view quote items"
ON public.quote_items FOR SELECT
USING (EXISTS (
    SELECT 1 FROM public.quotes
    WHERE quotes.id = quote_items.quote_id
    AND quotes.company_id = get_user_company(auth.uid())
));

CREATE POLICY "Vibe admins can view all quote items"
ON public.quote_items FOR SELECT
USING (has_role(auth.uid(), 'vibe_admin'));

CREATE POLICY "Users can create quote items"
ON public.quote_items FOR INSERT
WITH CHECK (EXISTS (
    SELECT 1 FROM public.quotes
    WHERE quotes.id = quote_items.quote_id
    AND quotes.company_id = get_user_company(auth.uid())
));

CREATE POLICY "Vibe admins can create all quote items"
ON public.quote_items FOR INSERT
WITH CHECK (has_role(auth.uid(), 'vibe_admin'));

CREATE POLICY "Admins can update quote items"
ON public.quote_items FOR UPDATE
USING (has_role(auth.uid(), 'admin') AND EXISTS (
    SELECT 1 FROM public.quotes
    WHERE quotes.id = quote_items.quote_id
    AND quotes.company_id = get_user_company(auth.uid())
));

CREATE POLICY "Vibe admins can update all quote items"
ON public.quote_items FOR UPDATE
USING (has_role(auth.uid(), 'vibe_admin'));

CREATE POLICY "Admins can delete quote items"
ON public.quote_items FOR DELETE
USING (has_role(auth.uid(), 'admin') AND EXISTS (
    SELECT 1 FROM public.quotes
    WHERE quotes.id = quote_items.quote_id
    AND quotes.company_id = get_user_company(auth.uid())
));

CREATE POLICY "Vibe admins can delete all quote items"
ON public.quote_items FOR DELETE
USING (has_role(auth.uid(), 'vibe_admin'));

-- Create updated_at trigger for quotes
CREATE TRIGGER update_quotes_updated_at
BEFORE UPDATE ON public.quotes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for quote uploads
INSERT INTO storage.buckets (id, name, public) 
VALUES ('quote-documents', 'quote-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for quote documents
CREATE POLICY "Users can upload quote documents"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'quote-documents' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can view quote documents"
ON storage.objects FOR SELECT
USING (bucket_id = 'quote-documents' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete their quote documents"
ON storage.objects FOR DELETE
USING (bucket_id = 'quote-documents' AND auth.uid() IS NOT NULL);