-- Add FK from trips.owner_id to profiles.user_id so PostgREST can resolve the
-- `owner:profiles!owner_id(...)` embed used by useDiscoverableTrips. The FK to
-- auth.users(id) (trips_owner_id_fkey) already exists; this is a parallel FK
-- against the profiles unique index profiles_user_id_key.
ALTER TABLE public.trips
  ADD CONSTRAINT trips_owner_id_profiles_fkey
  FOREIGN KEY (owner_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

-- Reload PostgREST schema cache so the new relationship is visible immediately.
NOTIFY pgrst, 'reload schema';
