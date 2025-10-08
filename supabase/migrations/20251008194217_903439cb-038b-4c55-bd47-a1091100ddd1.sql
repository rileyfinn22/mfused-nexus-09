-- Revert riley@vibepkg.com back to customer admin role for Mfused
UPDATE public.user_roles 
SET role = 'admin'
WHERE user_id = '3de83d45-be46-41b4-8127-a5fa1382410e';