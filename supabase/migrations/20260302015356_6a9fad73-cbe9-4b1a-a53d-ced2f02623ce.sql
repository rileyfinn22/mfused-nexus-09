
-- Create chat_profiles table
CREATE TABLE public.chat_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  display_name text NOT NULL,
  avatar_color text NOT NULL DEFAULT '#6366f1',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.chat_profiles ENABLE ROW LEVEL SECURITY;

-- RLS: vibe_admin only
CREATE POLICY "Vibe admins can manage chat profiles"
  ON public.chat_profiles
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'vibe_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'vibe_admin'::app_role));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_profiles;
