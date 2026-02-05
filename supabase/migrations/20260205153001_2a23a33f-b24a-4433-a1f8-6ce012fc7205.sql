-- Delete the orphaned auth user for purchasing@vireohealth.com so they can sign up fresh
DELETE FROM auth.users WHERE email = 'purchasing@vireohealth.com';