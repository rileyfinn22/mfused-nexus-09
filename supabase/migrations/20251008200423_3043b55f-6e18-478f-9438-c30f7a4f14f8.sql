-- Add foreign key constraints that don't exist yet
-- Use DO blocks to check if constraints exist before adding

DO $$ 
BEGIN
  -- Add orders foreign key if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'orders_company_id_fkey'
  ) THEN
    ALTER TABLE public.orders
    ADD CONSTRAINT orders_company_id_fkey 
    FOREIGN KEY (company_id) REFERENCES public.companies(id);
  END IF;

  -- Add products foreign key if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'products_company_id_fkey'
  ) THEN
    ALTER TABLE public.products
    ADD CONSTRAINT products_company_id_fkey 
    FOREIGN KEY (company_id) REFERENCES public.companies(id);
  END IF;

  -- Add inventory foreign key if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'inventory_company_id_fkey'
  ) THEN
    ALTER TABLE public.inventory
    ADD CONSTRAINT inventory_company_id_fkey 
    FOREIGN KEY (company_id) REFERENCES public.companies(id);
  END IF;

  -- Add user_roles foreign key if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'user_roles_company_id_fkey'
  ) THEN
    ALTER TABLE public.user_roles
    ADD CONSTRAINT user_roles_company_id_fkey 
    FOREIGN KEY (company_id) REFERENCES public.companies(id);
  END IF;
END $$;