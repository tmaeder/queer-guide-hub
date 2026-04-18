-- ============================================================
-- trip_concierge_messages: per-trip conversation history with the AI
-- concierge. Multi-turn chat replaces the one-shot AI plan tab — each
-- trip has its own thread, persisted so users can come back and continue.
--
-- `draft` holds the optional structured itinerary JSON when the assistant
-- proposed a plan that the user can apply with one click.
-- ============================================================

CREATE TABLE public.trip_concierge_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  draft JSONB,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_trip_concierge_messages_trip_created
  ON public.trip_concierge_messages(trip_id, created_at);

ALTER TABLE public.trip_concierge_messages ENABLE ROW LEVEL SECURITY;

-- Trip members (any role) can read + insert messages for their own trip.
CREATE POLICY trip_concierge_select ON public.trip_concierge_messages FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.id = trip_concierge_messages.trip_id
      AND (t.owner_id = (SELECT auth.uid())
           OR EXISTS (
             SELECT 1 FROM public.trip_members m
             WHERE m.trip_id = t.id AND m.user_id = (SELECT auth.uid())
           ))
  )
);

CREATE POLICY trip_concierge_insert ON public.trip_concierge_messages FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.id = trip_concierge_messages.trip_id
      AND (t.owner_id = (SELECT auth.uid())
           OR EXISTS (
             SELECT 1 FROM public.trip_members m
             WHERE m.trip_id = t.id AND m.user_id = (SELECT auth.uid())
                   AND m.role IN ('owner','editor')
           ))
  )
);
