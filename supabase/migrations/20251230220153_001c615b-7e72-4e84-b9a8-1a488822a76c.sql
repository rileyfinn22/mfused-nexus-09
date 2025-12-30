-- Make order_id nullable so we can create expense POs without orders
ALTER TABLE public.vendor_pos 
ALTER COLUMN order_id DROP NOT NULL;

-- Add po_type to distinguish between production orders and expenses
ALTER TABLE public.vendor_pos 
ADD COLUMN po_type text NOT NULL DEFAULT 'production';

-- Add description for expense details
ALTER TABLE public.vendor_pos 
ADD COLUMN description text;

-- Add customer_company_id to track which customer the expense is for (optional)
ALTER TABLE public.vendor_pos 
ADD COLUMN customer_company_id uuid REFERENCES public.companies(id);

-- Add expense_category for categorizing expenses
ALTER TABLE public.vendor_pos 
ADD COLUMN expense_category text;

-- Update RLS policies to allow vibe admins to create expense POs
-- (existing policies already allow vibe_admin to create vendor POs)