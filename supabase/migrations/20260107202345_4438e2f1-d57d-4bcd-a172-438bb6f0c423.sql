-- Create table for vibe note attachments (internal notes for orders in production)
CREATE TABLE public.vibe_note_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT,
  uploaded_by UUID,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.vibe_note_attachments ENABLE ROW LEVEL SECURITY;

-- Only vibe_admin can view and manage these attachments
CREATE POLICY "Vibe admins can view vibe note attachments"
ON public.vibe_note_attachments
FOR SELECT
USING (has_role(auth.uid(), 'vibe_admin'));

CREATE POLICY "Vibe admins can insert vibe note attachments"
ON public.vibe_note_attachments
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'vibe_admin'));

CREATE POLICY "Vibe admins can delete vibe note attachments"
ON public.vibe_note_attachments
FOR DELETE
USING (has_role(auth.uid(), 'vibe_admin'));

-- Create storage bucket for vibe attachments if not exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('vibe-attachments', 'vibe-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies - only vibe admins can access
CREATE POLICY "Vibe admins can view vibe attachments"
ON storage.objects
FOR SELECT
USING (bucket_id = 'vibe-attachments' AND has_role(auth.uid(), 'vibe_admin'));

CREATE POLICY "Vibe admins can upload vibe attachments"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'vibe-attachments' AND has_role(auth.uid(), 'vibe_admin'));

CREATE POLICY "Vibe admins can delete vibe attachments"
ON storage.objects
FOR DELETE
USING (bucket_id = 'vibe-attachments' AND has_role(auth.uid(), 'vibe_admin'));