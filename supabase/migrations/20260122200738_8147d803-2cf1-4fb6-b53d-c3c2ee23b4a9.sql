-- Create order_attachments table for multiple attachments per order
CREATE TABLE public.order_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  description TEXT,
  uploaded_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.order_attachments ENABLE ROW LEVEL SECURITY;

-- Create policies for order attachments
CREATE POLICY "Users can view order attachments for their company orders"
ON public.order_attachments
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    JOIN public.user_roles ur ON ur.company_id = o.company_id
    WHERE o.id = order_attachments.order_id
    AND ur.user_id = auth.uid()
  )
);

CREATE POLICY "Users can create order attachments for their company orders"
ON public.order_attachments
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.orders o
    JOIN public.user_roles ur ON ur.company_id = o.company_id
    WHERE o.id = order_attachments.order_id
    AND ur.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete order attachments for their company orders"
ON public.order_attachments
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    JOIN public.user_roles ur ON ur.company_id = o.company_id
    WHERE o.id = order_attachments.order_id
    AND ur.user_id = auth.uid()
  )
);

-- Create index for faster lookups
CREATE INDEX idx_order_attachments_order_id ON public.order_attachments(order_id);