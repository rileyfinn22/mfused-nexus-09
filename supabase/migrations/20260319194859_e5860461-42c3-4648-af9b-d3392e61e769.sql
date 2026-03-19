INSERT INTO storage.buckets (id, name, public) VALUES ('quote-documents', 'quote-documents', false) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Vibe admins can upload quote documents"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'quote-documents' AND public.has_role(auth.uid(), 'vibe_admin'));

CREATE POLICY "Vibe admins can read quote documents"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'quote-documents' AND public.has_role(auth.uid(), 'vibe_admin'));

CREATE POLICY "Vibe admins can delete quote documents"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'quote-documents' AND public.has_role(auth.uid(), 'vibe_admin'));