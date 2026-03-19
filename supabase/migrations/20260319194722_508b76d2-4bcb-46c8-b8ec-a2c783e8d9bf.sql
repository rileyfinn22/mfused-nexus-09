CREATE TABLE public.quote_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_size integer,
  file_type text,
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid
);

ALTER TABLE public.quote_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vibe admins can manage quote documents"
  ON public.quote_documents
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'vibe_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'vibe_admin'));