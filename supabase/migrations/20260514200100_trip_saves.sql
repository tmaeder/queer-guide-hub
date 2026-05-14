-- trip_saves: lightweight bookmark relation between user ↔ public trip.
-- Used by the /trips Saved chip and as social-proof signal on Discover cards.

CREATE TABLE IF NOT EXISTS public.trip_saves (
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trip_id, user_id)
);

CREATE INDEX IF NOT EXISTS trip_saves_user_idx ON public.trip_saves(user_id, created_at DESC);

ALTER TABLE public.trip_saves ENABLE ROW LEVEL SECURITY;

-- Users see and manage only their own saves.
DROP POLICY IF EXISTS trip_saves_self_select ON public.trip_saves;
CREATE POLICY trip_saves_self_select ON public.trip_saves
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS trip_saves_self_insert ON public.trip_saves;
CREATE POLICY trip_saves_self_insert ON public.trip_saves
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.trips t WHERE t.id = trip_id AND t.is_public = true)
  );

DROP POLICY IF EXISTS trip_saves_self_delete ON public.trip_saves;
CREATE POLICY trip_saves_self_delete ON public.trip_saves
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Maintain trips.save_count via trigger.
CREATE OR REPLACE FUNCTION public._trip_saves_bump_count()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.trips SET save_count = save_count + 1 WHERE id = NEW.trip_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.trips SET save_count = GREATEST(save_count - 1, 0) WHERE id = OLD.trip_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trip_saves_count_trg ON public.trip_saves;
CREATE TRIGGER trip_saves_count_trg
AFTER INSERT OR DELETE ON public.trip_saves
FOR EACH ROW EXECUTE FUNCTION public._trip_saves_bump_count();
