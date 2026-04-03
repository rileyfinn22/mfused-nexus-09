ALTER TABLE public.products ADD COLUMN print_template_id uuid REFERENCES public.print_templates(id) ON DELETE SET NULL;

CREATE INDEX idx_products_print_template_id ON public.products (print_template_id);