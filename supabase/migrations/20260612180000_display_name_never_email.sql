-- display_name must never be the account email. Older signups seeded
-- display_name from the full email (current handle_new_user uses the local
-- part), which links a profile to a legal identity — an outing vector on a
-- platform whose core promise is identity control. Replace any display_name
-- that equals the account email with the email's local part, matching what
-- handle_new_user seeds today. Frontend additionally refuses to render
-- email-shaped names (src/lib/displayName.ts).

UPDATE public.profiles
SET display_name = split_part(email, '@', 1)
WHERE email IS NOT NULL
  AND display_name IS NOT NULL
  AND lower(trim(display_name)) = lower(trim(email));
