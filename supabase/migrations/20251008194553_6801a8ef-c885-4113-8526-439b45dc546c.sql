-- Set justin@vibepkg.com to vibe_admin role
UPDATE public.user_roles 
SET role = 'vibe_admin'
WHERE user_id = '8876ec0f-e82d-4b66-b6c1-3c4fa9a38150';