-- Update user role to vibe_admin for VibePKG access
UPDATE public.user_roles 
SET role = 'vibe_admin'
WHERE user_id = '2a6f9048-00fb-416c-b425-b8b7d24eecd8';