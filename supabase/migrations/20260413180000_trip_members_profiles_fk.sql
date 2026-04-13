-- Add FK so PostgREST can resolve profiles:user_id(...) joins on trip_members
ALTER TABLE public.trip_members
  ADD CONSTRAINT trip_members_user_id_profiles_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(user_id);
