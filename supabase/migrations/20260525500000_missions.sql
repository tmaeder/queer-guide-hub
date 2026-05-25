-- Milestone "merry-plotting-beacon" Phase 9 — Missions (per-user weekly + one-shot targets).
--
-- Distinct from public.quests, which is the community-narrative quest table
-- (themes, recap articles, contributions). Missions are bite-sized personal
-- targets computed off user_activity_events: "Check in at 3 new venues this
-- week", "Wrap up a guide". Live-computed; no per-user progress storage.
--
-- Criteria schema (mission_definitions.criteria):
--   { kind: 'count_events',
--     event_type: '<event_type>',         -- one event_type from activity_event_rules
--     target: <int>,                      -- threshold to claim
--     period: 'week' | 'season' | 'all',  -- rolling window vs lifetime
--     distinct_target: false              -- (optional) count distinct target_ids
--   }
-- Future kinds can extend the engine without schema change.

CREATE TABLE IF NOT EXISTS public.mission_definitions (
  slug          text PRIMARY KEY,
  title         text NOT NULL,
  description   text NOT NULL,
  domain        text NOT NULL,
  criteria      jsonb NOT NULL,
  points_reward integer NOT NULL DEFAULT 0,
  period        text NOT NULL CHECK (period IN ('weekly','seasonal','one_shot')),
  starts_at     timestamptz,
  ends_at       timestamptz,
  sort_order    int NOT NULL DEFAULT 100,
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mission_definitions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mission_definitions_public_select ON public.mission_definitions;
CREATE POLICY mission_definitions_public_select ON public.mission_definitions
  FOR SELECT TO anon, authenticated USING (active);

-- Seed: 8 starter missions. No dating, per plan §Phase 9.
INSERT INTO public.mission_definitions
  (slug, title, description, domain, criteria, points_reward, period, sort_order) VALUES
  ('weekly-checkins-3',  'Three checkins this week',
     'Visit three venues this week.', 'venue',
     '{"kind":"count_events","event_type":"venue.checkin","target":3,"period":"week","distinct_target":true}'::jsonb,
     30, 'weekly', 10),
  ('weekly-marketplace-save', 'Save a marketplace listing',
     'Save at least one listing this week.', 'marketplace',
     '{"kind":"count_events","event_type":"marketplace.favorite_added","target":1,"period":"week"}'::jsonb,
     10, 'weekly', 20),
  ('weekly-guide-read', 'Finish a guide',
     'Read a marketplace guide to completion this week.', 'marketplace',
     '{"kind":"count_events","event_type":"marketplace.guide_completed","target":1,"period":"week"}'::jsonb,
     20, 'weekly', 30),
  ('weekly-review', 'Leave a review',
     'Write one marketplace review this week.', 'marketplace',
     '{"kind":"count_events","event_type":"marketplace.review_posted","target":1,"period":"week"}'::jsonb,
     30, 'weekly', 40),
  ('weekly-event-rsvp', 'RSVP to an event',
     'Mark yourself going (or interested) on any event this week.', 'event',
     '{"kind":"count_events","event_type":"event.rsvp","target":1,"period":"week"}'::jsonb,
     10, 'weekly', 50),
  ('oneshot-first-trip', 'Plan your first trip',
     'Create your first trip on queer.guide.', 'trip',
     '{"kind":"count_events","event_type":"trip.created","target":1,"period":"all"}'::jsonb,
     30, 'one_shot', 60),
  ('oneshot-join-group', 'Find your people',
     'Join a community group.', 'group',
     '{"kind":"count_events","event_type":"group.joined","target":1,"period":"all"}'::jsonb,
     15, 'one_shot', 70),
  ('oneshot-first-contribution', 'Make a submission',
     'Submit your first venue or event to be reviewed.', 'contribution',
     '{"kind":"count_events","event_type":"contribution.submission_accepted","target":1,"period":"all"}'::jsonb,
     50, 'one_shot', 80)
ON CONFLICT (slug) DO UPDATE SET
  title=EXCLUDED.title, description=EXCLUDED.description, domain=EXCLUDED.domain,
  criteria=EXCLUDED.criteria, points_reward=EXCLUDED.points_reward,
  period=EXCLUDED.period, sort_order=EXCLUDED.sort_order, active=EXCLUDED.active;

-- Compute progress for all active missions for a user. Returns one row per
-- mission. Frontend reads + caches; cap recomputes are cheap (single SELECT
-- per mission, indexed on user_activity_events).
CREATE OR REPLACE FUNCTION public.compute_user_missions(p_user_id uuid)
RETURNS TABLE(
  slug          text,
  title         text,
  description   text,
  domain        text,
  period        text,
  points_reward integer,
  target        integer,
  progress      integer,
  completed     boolean,
  sort_order    int
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  m         public.mission_definitions%ROWTYPE;
  v_target  int;
  v_etype   text;
  v_period  text;
  v_window  interval;
  v_count   int;
  v_distinct boolean;
BEGIN
  IF p_user_id IS NULL THEN RETURN; END IF;
  FOR m IN
    SELECT * FROM public.mission_definitions
     WHERE active
       AND (starts_at IS NULL OR starts_at <= now())
       AND (ends_at   IS NULL OR ends_at   >  now())
     ORDER BY sort_order
  LOOP
    v_target   := COALESCE((m.criteria->>'target')::int, 1);
    v_etype    := m.criteria->>'event_type';
    v_period   := COALESCE(m.criteria->>'period', 'week');
    v_distinct := COALESCE((m.criteria->>'distinct_target')::boolean, false);
    v_window   := CASE v_period
                    WHEN 'week'   THEN INTERVAL '7 days'
                    WHEN 'season' THEN INTERVAL '90 days'
                    ELSE INTERVAL '100 years'
                  END;

    IF (m.criteria->>'kind') = 'count_events' AND v_etype IS NOT NULL THEN
      IF v_distinct THEN
        SELECT COUNT(DISTINCT target_id) INTO v_count
          FROM public.user_activity_events
         WHERE user_id = p_user_id
           AND event_type = v_etype
           AND created_at >= now() - v_window;
      ELSE
        SELECT COUNT(*) INTO v_count
          FROM public.user_activity_events
         WHERE user_id = p_user_id
           AND event_type = v_etype
           AND created_at >= now() - v_window;
      END IF;
    ELSE
      v_count := 0;
    END IF;

    slug          := m.slug;
    title         := m.title;
    description   := m.description;
    domain        := m.domain;
    period        := m.period;
    points_reward := m.points_reward;
    target        := v_target;
    progress      := LEAST(v_count, v_target);
    completed     := v_count >= v_target;
    sort_order    := m.sort_order;
    RETURN NEXT;
  END LOOP;
END
$$;

REVOKE EXECUTE ON FUNCTION public.compute_user_missions(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.compute_user_missions(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.my_missions()
RETURNS TABLE(
  slug text, title text, description text, domain text, period text,
  points_reward integer, target integer, progress integer, completed boolean, sort_order int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT * FROM public.compute_user_missions(auth.uid());
$$;
REVOKE EXECUTE ON FUNCTION public.my_missions() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.my_missions() TO authenticated;
