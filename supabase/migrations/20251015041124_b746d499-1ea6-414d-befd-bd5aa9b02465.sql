-- Create production stages table
CREATE TABLE public.production_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  stage_name text NOT NULL CHECK (stage_name IN ('material', 'print', 'convert', 'qc', 'shipped', 'delivered')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  sequence_order integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_id, stage_name)
);

-- Create production stage updates table
CREATE TABLE public.production_stage_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id uuid NOT NULL REFERENCES public.production_stages(id) ON DELETE CASCADE,
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  update_type text NOT NULL CHECK (update_type IN ('note', 'image', 'status_change')),
  note_text text,
  image_url text,
  previous_status text,
  new_status text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.production_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_stage_updates ENABLE ROW LEVEL SECURITY;

-- RLS Policies for production_stages
CREATE POLICY "Vibe admins can view all production stages"
ON public.production_stages FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'vibe_admin'::app_role));

CREATE POLICY "Vendors can view their assigned stages"
ON public.production_stages FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'vendor'::app_role) AND
  vendor_id IN (SELECT id FROM public.vendors WHERE user_id = auth.uid())
);

CREATE POLICY "Customers can view their company production stages"
ON public.production_stages FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = production_stages.order_id
    AND o.company_id = get_user_company(auth.uid())
  )
);

CREATE POLICY "Vibe admins can create production stages"
ON public.production_stages FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'vibe_admin'::app_role));

CREATE POLICY "Vibe admins can update production stages"
ON public.production_stages FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'vibe_admin'::app_role));

CREATE POLICY "Vendors can update their assigned stages"
ON public.production_stages FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'vendor'::app_role) AND
  vendor_id IN (SELECT id FROM public.vendors WHERE user_id = auth.uid())
);

-- RLS Policies for production_stage_updates
CREATE POLICY "Vibe admins can view all updates"
ON public.production_stage_updates FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'vibe_admin'::app_role));

CREATE POLICY "Vendors can view updates for their stages"
ON public.production_stage_updates FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'vendor'::app_role) AND
  EXISTS (
    SELECT 1 FROM public.production_stages ps
    INNER JOIN public.vendors v ON ps.vendor_id = v.id
    WHERE ps.id = production_stage_updates.stage_id
    AND v.user_id = auth.uid()
  )
);

CREATE POLICY "Customers can view their company stage updates"
ON public.production_stage_updates FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.production_stages ps
    INNER JOIN public.orders o ON ps.order_id = o.id
    WHERE ps.id = production_stage_updates.stage_id
    AND o.company_id = get_user_company(auth.uid())
  )
);

CREATE POLICY "Vibe admins can create updates"
ON public.production_stage_updates FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'vibe_admin'::app_role));

CREATE POLICY "Vendors can create updates for their stages"
ON public.production_stage_updates FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'vendor'::app_role) AND
  EXISTS (
    SELECT 1 FROM public.production_stages ps
    INNER JOIN public.vendors v ON ps.vendor_id = v.id
    WHERE ps.id = production_stage_updates.stage_id
    AND v.user_id = auth.uid()
  )
);

CREATE POLICY "Authenticated users can create notes"
ON public.production_stage_updates FOR INSERT
TO authenticated
WITH CHECK (
  update_type = 'note' AND
  EXISTS (
    SELECT 1 FROM public.production_stages ps
    INNER JOIN public.orders o ON ps.order_id = o.id
    WHERE ps.id = production_stage_updates.stage_id
    AND o.company_id = get_user_company(auth.uid())
  )
);

-- Create trigger for updating updated_at on production_stages
CREATE OR REPLACE FUNCTION public.update_production_stages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER update_production_stages_updated_at
BEFORE UPDATE ON public.production_stages
FOR EACH ROW
EXECUTE FUNCTION public.update_production_stages_updated_at();

-- Create storage bucket for production stage images
INSERT INTO storage.buckets (id, name, public)
VALUES ('production-images', 'production-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for production images
CREATE POLICY "Authenticated users can upload production images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'production-images' AND
  (has_role(auth.uid(), 'vibe_admin'::app_role) OR has_role(auth.uid(), 'vendor'::app_role))
);

CREATE POLICY "Production images are publicly accessible"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'production-images');