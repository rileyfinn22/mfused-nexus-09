-- Add vendor role to app_role enum (must be in separate transaction)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'vendor';

-- Add user_id to vendors table for authentication
ALTER TABLE public.vendors 
ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.vendors 
ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;