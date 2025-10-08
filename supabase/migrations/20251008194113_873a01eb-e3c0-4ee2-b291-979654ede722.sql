-- Revert rileyfinn22@gmail.com back to customer admin role
UPDATE public.user_roles 
SET role = 'admin'
WHERE user_id = '2a6f9048-00fb-416c-b425-b8b7d24eecd8';