-- Create artwork_files table
CREATE TABLE public.artwork_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT NOT NULL,
  artwork_url TEXT NOT NULL,
  preview_url TEXT,
  filename TEXT NOT NULL,
  is_approved BOOLEAN NOT NULL DEFAULT false,
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.artwork_files ENABLE ROW LEVEL SECURITY;

-- Everyone can view artwork files
CREATE POLICY "Anyone can view artwork files"
ON public.artwork_files
FOR SELECT
TO authenticated
USING (true);

-- Authenticated users can insert artwork files
CREATE POLICY "Authenticated users can create artwork"
ON public.artwork_files
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Admins can update artwork files
CREATE POLICY "Admins can update artwork"
ON public.artwork_files
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Admins can delete artwork files
CREATE POLICY "Admins can delete artwork"
ON public.artwork_files
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_artwork_files_updated_at
BEFORE UPDATE ON public.artwork_files
FOR EACH ROW
EXECUTE FUNCTION public.update_po_submissions_updated_at();

-- Create storage bucket for artwork
INSERT INTO storage.buckets (id, name, public)
VALUES ('artwork', 'artwork', true);

-- Storage policies for artwork
CREATE POLICY "Anyone can view artwork"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'artwork');

CREATE POLICY "Authenticated users can upload artwork"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'artwork');

CREATE POLICY "Admins can update artwork"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'artwork' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete artwork"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'artwork' AND public.has_role(auth.uid(), 'admin'));