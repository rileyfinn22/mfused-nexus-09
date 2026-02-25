
CREATE TABLE public.production_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name text NOT NULL,
  author_role text NOT NULL DEFAULT 'customer',
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.production_comments ENABLE ROW LEVEL SECURITY;

-- Vibe admins can do everything
CREATE POLICY "Vibe admins can manage all production comments"
  ON public.production_comments FOR ALL
  USING (has_role(auth.uid(), 'vibe_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'vibe_admin'::app_role));

-- Company users can view comments on their orders
CREATE POLICY "Company users can view production comments"
  ON public.production_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = production_comments.order_id
      AND user_has_company_access(auth.uid(), o.company_id)
    )
  );

-- Company users can insert their own comments
CREATE POLICY "Company users can add production comments"
  ON public.production_comments FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = production_comments.order_id
      AND user_has_company_access(auth.uid(), o.company_id)
    )
  );
