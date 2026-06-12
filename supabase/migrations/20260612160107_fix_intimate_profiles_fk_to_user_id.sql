-- intimate_profiles.id is the auth uid everywhere (RLS: id = auth.uid(),
-- app upserts id = user.id), but the FK pointed at profiles.id — the profile
-- row PK, a different value space. Every activation failed with 23503.
-- Repoint to profiles.user_id (UNIQUE, the auth uid). Table was empty (0 rows)
-- at migration time, so no data rewrite needed.

ALTER TABLE public.intimate_profiles DROP CONSTRAINT intimate_profiles_id_fkey;
ALTER TABLE public.intimate_profiles
  ADD CONSTRAINT intimate_profiles_id_fkey
  FOREIGN KEY (id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;
