-- Set riley@vibepkg.com to vibe_admin for VibePKG staff access
UPDATE public.user_roles 
SET role = 'vibe_admin'
WHERE user_id = '3de83d45-be46-41b4-8127-a5fa1382410e';