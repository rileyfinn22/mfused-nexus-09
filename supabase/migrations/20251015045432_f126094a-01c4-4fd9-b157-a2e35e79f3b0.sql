-- Add fulfillment vendor flag to vendors table
ALTER TABLE public.vendors
ADD COLUMN is_fulfillment_vendor boolean NOT NULL DEFAULT false;

-- Add pull and ship specific fields to orders table
ALTER TABLE public.orders
ADD COLUMN fulfillment_vendor_id uuid REFERENCES public.vendors(id),
ADD COLUMN shipping_cost numeric DEFAULT 0,
ADD COLUMN vibe_approved boolean NOT NULL DEFAULT false,
ADD COLUMN vibe_approved_by uuid,
ADD COLUMN vibe_approved_at timestamp with time zone;

-- Update RLS policy for vendors to allow viewing fulfillment vendors
CREATE POLICY "Fulfillment vendors can view their assigned orders"
ON public.orders
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'vendor'::app_role) 
  AND fulfillment_vendor_id IN (
    SELECT id FROM public.vendors WHERE user_id = auth.uid()
  )
);