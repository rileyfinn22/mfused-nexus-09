
-- Chat channels (both group channels and DMs)
CREATE TABLE public.chat_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  is_dm boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vibe admins can manage channels" ON public.chat_channels
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'vibe_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'vibe_admin'::app_role));

-- Channel members
CREATE TABLE public.chat_channel_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid REFERENCES public.chat_channels(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(channel_id, user_id)
);

ALTER TABLE public.chat_channel_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vibe admins can manage channel members" ON public.chat_channel_members
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'vibe_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'vibe_admin'::app_role));

-- Chat messages
CREATE TABLE public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid REFERENCES public.chat_channels(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  content text NOT NULL,
  parent_message_id uuid REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  is_edited boolean NOT NULL DEFAULT false
);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vibe admins can manage messages" ON public.chat_messages
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'vibe_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'vibe_admin'::app_role));

-- Message attachments
CREATE TABLE public.chat_message_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid REFERENCES public.chat_messages(id) ON DELETE CASCADE NOT NULL,
  file_url text NOT NULL,
  file_name text NOT NULL,
  file_type text,
  file_size integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_message_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vibe admins can manage attachments" ON public.chat_message_attachments
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'vibe_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'vibe_admin'::app_role));

-- Storage bucket for chat files
INSERT INTO storage.buckets (id, name, public) VALUES ('chat-files', 'chat-files', false);

CREATE POLICY "Vibe admins can upload chat files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-files' AND has_role(auth.uid(), 'vibe_admin'::app_role));

CREATE POLICY "Vibe admins can view chat files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'chat-files' AND has_role(auth.uid(), 'vibe_admin'::app_role));

CREATE POLICY "Vibe admins can delete chat files" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'chat-files' AND has_role(auth.uid(), 'vibe_admin'::app_role));

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;

-- Create default #general channel
INSERT INTO public.chat_channels (name, description) VALUES ('general', 'General team discussion');

-- Function to get user email for chat display
CREATE OR REPLACE FUNCTION public.get_chat_user_info(p_user_id uuid)
RETURNS TABLE(user_id uuid, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT au.id as user_id, au.email
  FROM auth.users au
  WHERE au.id = p_user_id
    AND has_role(auth.uid(), 'vibe_admin'::app_role)
$$;
