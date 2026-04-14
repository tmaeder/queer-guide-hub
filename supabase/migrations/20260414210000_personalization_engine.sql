-- Personalization Engine: behavioral tracking + recommendation cache

CREATE TABLE public.user_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  entity_type text,
  entity_id text,
  metadata jsonb DEFAULT '{}',
  session_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_events_user ON public.user_events(user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX idx_user_events_session ON public.user_events(session_id, created_at DESC) WHERE session_id IS NOT NULL;
CREATE INDEX idx_user_events_type ON public.user_events(event_type, entity_type);

ALTER TABLE public.user_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own events" ON public.user_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own events" ON public.user_events FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE TABLE public.user_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id text,
  rec_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  score numeric NOT NULL DEFAULT 0,
  reason text,
  metadata jsonb DEFAULT '{}',
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (user_id, rec_type, entity_type, entity_id)
);

CREATE INDEX idx_recs_user_type ON public.user_recommendations(user_id, rec_type, score DESC) WHERE user_id IS NOT NULL;
CREATE INDEX idx_recs_session ON public.user_recommendations(session_id, rec_type, score DESC) WHERE session_id IS NOT NULL;

ALTER TABLE public.user_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own recommendations" ON public.user_recommendations FOR SELECT USING (auth.uid() = user_id OR session_id IS NOT NULL);
