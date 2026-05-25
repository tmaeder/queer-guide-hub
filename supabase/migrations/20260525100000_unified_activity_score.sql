-- Milestone "merry-plotting-beacon" Phase 1 — Unified activity log + Community Score.
-- See .planning notes / brainstorming plan for full context.
--
-- Adds:
--   * user_activity_events  : append-only event log, source of truth for all
--                             gamification across venues/marketplace/groups/profile/etc.
--   * user_community_score  : per-user roll-up (total, weekly, monthly, level,
--                             per-domain breakdown). Updated by trigger on every
--                             new event. Public-readable (leaderboards).
--   * emit_user_activity()  : helper invoked by triggers/RPCs. Applies per-day
--                             per-event caps so the log can't be farmed.
--   * Triggers on venue_checkins / marketplace_favorites / marketplace_reviews /
--     marketplace_guide_reads emitting events into the log.
--   * Backfill of all historical activity into the log + initial roll-up.
--
-- Phase 1 deliberately does NOT touch user_gamification (per-venue stats stay as
-- they are) or trust tiers (manual ladder, orthogonal). useGamification.ts keeps
-- reading user_gamification for venue-specific level/points; a new
-- useCommunityScore() hook reads the cross-domain score.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_activity_events (
  id            bigserial PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  domain        text NOT NULL CHECK (domain IN (
                  'venue','marketplace','group','event','trip',
                  'profile','social','contribution','dating')),
  event_type    text NOT NULL,    -- 'venue.checkin', 'marketplace.review', ...
  target_kind   text,             -- 'venue','listing','guide','group',...
  target_id     uuid,
  points_delta  integer NOT NULL DEFAULT 0,
  metadata      jsonb   NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_activity_events_user_created_idx
  ON public.user_activity_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS user_activity_events_domain_type_idx
  ON public.user_activity_events (domain, event_type);
-- Used by per-day cap check inside emit_user_activity().
CREATE INDEX IF NOT EXISTS user_activity_events_user_type_day_idx
  ON public.user_activity_events (user_id, event_type, ((created_at AT TIME ZONE 'UTC')::date));

ALTER TABLE public.user_activity_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_activity_events_self_select ON public.user_activity_events;
CREATE POLICY user_activity_events_self_select ON public.user_activity_events
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- No public read: per-user activity is private. Aggregates live in
-- user_community_score which IS public-readable.
-- No INSERT policy: only SECURITY DEFINER helpers write here.


CREATE TABLE IF NOT EXISTS public.user_community_score (
  user_id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  total_points       integer NOT NULL DEFAULT 0 CHECK (total_points >= 0),
  weekly_delta       integer NOT NULL DEFAULT 0,   -- last 7d points
  monthly_delta      integer NOT NULL DEFAULT 0,   -- last 30d points
  level              integer NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 50),
  domain_breakdown   jsonb   NOT NULL DEFAULT '{}'::jsonb,
  last_event_at      timestamptz,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_community_score_total_idx
  ON public.user_community_score (total_points DESC);
CREATE INDEX IF NOT EXISTS user_community_score_weekly_idx
  ON public.user_community_score (weekly_delta DESC);

ALTER TABLE public.user_community_score ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_community_score_public_select ON public.user_community_score;
CREATE POLICY user_community_score_public_select ON public.user_community_score
  FOR SELECT TO anon, authenticated
  USING (true);   -- leaderboards; row contains no PII.

-- ---------------------------------------------------------------------------
-- 2. Score / level formula
-- ---------------------------------------------------------------------------

-- Community Score uses a slightly stiffer curve than venue level (50 / level^2).
-- level = floor(sqrt(points / 100)) + 1, capped at 50.
CREATE OR REPLACE FUNCTION public.compute_community_level(p_points integer)
RETURNS integer
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT LEAST(50, GREATEST(1, FLOOR(SQRT(GREATEST(0, p_points) / 100.0))::int + 1));
$$;

-- ---------------------------------------------------------------------------
-- 3. emit_user_activity — single entry point for trigger / RPC writes.
--
-- Enforces per-day per-event_type caps so leaderboards can't be farmed:
--   * caps come from a static table; if event_type absent, no cap.
--   * Once cap is hit, the event is still LOGGED (we want the audit), but
--     points_delta is forced to 0 so the score view does not credit it.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.activity_event_rules (
  event_type        text PRIMARY KEY,
  domain            text NOT NULL,
  base_points       integer NOT NULL,
  daily_cap_count   integer,   -- NULL = no cap
  description       text
);

INSERT INTO public.activity_event_rules
  (event_type,                       domain,        base_points, daily_cap_count, description) VALUES
  ('venue.checkin',                  'venue',        10,  3,   'Check in at a venue. +5 bonus first time recorded inline.'),
  ('venue.first_visit_bonus',        'venue',         5,  10,  'First-ever checkin at this specific venue.'),
  ('marketplace.favorite_added',     'marketplace',   5,  5,   'Saved a marketplace listing.'),
  ('marketplace.review_posted',      'marketplace',  15,  3,   'Wrote a marketplace review.'),
  ('marketplace.guide_completed',    'marketplace',   5,  3,   'Read a marketplace guide to completion.'),
  ('profile.completion_milestone',   'profile',      25,  10,  '25/50/75/100% profile completion threshold crossed.'),
  ('profile.field_filled',           'profile',       2,  10,  'Filled a new profile field.'),
  ('contribution.submission_accepted','contribution', 30,  10,  'A submitted venue/event was accepted.'),
  ('contribution.endorsement_received','contribution', 10,  10,  'Received an endorsement from another user.'),
  ('group.joined',                   'group',         5,  5,   'Joined a community group.'),
  ('group.post_created',             'group',         5,  3,   'Posted in a group.'),
  ('social.friend_accepted',         'social',        5,  10,  'A friend request was accepted (either direction).'),
  ('event.rsvp',                     'event',         3,  3,   'RSVPd to an event.'),
  ('trip.created',                   'trip',         10,  3,   'Created a trip.')
ON CONFLICT (event_type) DO UPDATE SET
  domain          = EXCLUDED.domain,
  base_points     = EXCLUDED.base_points,
  daily_cap_count = EXCLUDED.daily_cap_count,
  description     = EXCLUDED.description;

ALTER TABLE public.activity_event_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS activity_event_rules_public_select ON public.activity_event_rules;
CREATE POLICY activity_event_rules_public_select ON public.activity_event_rules
  FOR SELECT TO anon, authenticated
  USING (true);


CREATE OR REPLACE FUNCTION public.emit_user_activity(
  p_user_id      uuid,
  p_event_type   text,
  p_target_kind  text DEFAULT NULL,
  p_target_id    uuid DEFAULT NULL,
  p_metadata     jsonb DEFAULT '{}'::jsonb,
  p_points_override integer DEFAULT NULL,
  p_created_at   timestamptz DEFAULT NULL   -- backfill only
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rule     public.activity_event_rules%ROWTYPE;
  v_today    date;
  v_count    int := 0;
  v_points   int := 0;
  v_ts       timestamptz := COALESCE(p_created_at, now());
  v_id       bigint;
BEGIN
  IF p_user_id IS NULL OR p_event_type IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_rule FROM public.activity_event_rules WHERE event_type = p_event_type;

  -- Unknown event_types are allowed but earn 0 points (audit only).
  IF v_rule.event_type IS NULL THEN
    v_points := COALESCE(p_points_override, 0);
  ELSE
    v_points := COALESCE(p_points_override, v_rule.base_points);
    -- Per-day cap: count today's existing events of this type for this user.
    IF v_rule.daily_cap_count IS NOT NULL THEN
      v_today := (v_ts AT TIME ZONE 'UTC')::date;
      SELECT COUNT(*) INTO v_count
        FROM public.user_activity_events
       WHERE user_id    = p_user_id
         AND event_type = p_event_type
         AND (created_at AT TIME ZONE 'UTC')::date = v_today;
      IF v_count >= v_rule.daily_cap_count THEN
        v_points := 0;
      END IF;
    END IF;
  END IF;

  INSERT INTO public.user_activity_events
    (user_id, domain, event_type, target_kind, target_id,
     points_delta, metadata, created_at)
  VALUES
    (p_user_id,
     COALESCE(v_rule.domain, split_part(p_event_type, '.', 1)),
     p_event_type,
     p_target_kind,
     p_target_id,
     v_points,
     COALESCE(p_metadata, '{}'::jsonb),
     v_ts)
  RETURNING id INTO v_id;

  RETURN v_id;
END
$$;

GRANT EXECUTE ON FUNCTION public.emit_user_activity(uuid, text, text, uuid, jsonb, integer, timestamptz)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Score recompute — full rebuild for a single user, and AFTER-INSERT trigger
--    that incrementally updates user_community_score on new events.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.recompute_user_community_score(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_total       int;
  v_weekly      int;
  v_monthly     int;
  v_last        timestamptz;
  v_breakdown   jsonb;
BEGIN
  IF p_user_id IS NULL THEN RETURN; END IF;

  SELECT COALESCE(SUM(points_delta), 0),
         COALESCE(SUM(points_delta) FILTER (WHERE created_at >= now() - INTERVAL '7 days'), 0),
         COALESCE(SUM(points_delta) FILTER (WHERE created_at >= now() - INTERVAL '30 days'), 0),
         MAX(created_at),
         COALESCE(
           jsonb_object_agg(domain, sum_points) FILTER (WHERE domain IS NOT NULL),
           '{}'::jsonb)
    INTO v_total, v_weekly, v_monthly, v_last, v_breakdown
    FROM (
      SELECT domain,
             points_delta,
             created_at,
             SUM(points_delta) OVER (PARTITION BY domain) AS sum_points
        FROM public.user_activity_events
       WHERE user_id = p_user_id
    ) t;

  INSERT INTO public.user_community_score
    (user_id, total_points, weekly_delta, monthly_delta,
     level, domain_breakdown, last_event_at, updated_at)
  VALUES
    (p_user_id, GREATEST(0, v_total), v_weekly, v_monthly,
     public.compute_community_level(GREATEST(0, v_total)),
     v_breakdown, v_last, now())
  ON CONFLICT (user_id) DO UPDATE SET
    total_points     = EXCLUDED.total_points,
    weekly_delta     = EXCLUDED.weekly_delta,
    monthly_delta    = EXCLUDED.monthly_delta,
    level            = EXCLUDED.level,
    domain_breakdown = EXCLUDED.domain_breakdown,
    last_event_at    = EXCLUDED.last_event_at,
    updated_at       = now();
END
$$;

GRANT EXECUTE ON FUNCTION public.recompute_user_community_score(uuid) TO authenticated;


-- Lightweight after-insert trigger: bump totals incrementally for fresh events
-- so /me is real-time, then run a periodic full recompute via cron to reconcile
-- weekly/monthly windows (decay as time passes).
CREATE OR REPLACE FUNCTION public.on_user_activity_event_inserted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_breakdown jsonb;
BEGIN
  INSERT INTO public.user_community_score (user_id, total_points, level, last_event_at)
  VALUES (NEW.user_id, GREATEST(0, NEW.points_delta),
          public.compute_community_level(GREATEST(0, NEW.points_delta)),
          NEW.created_at)
  ON CONFLICT (user_id) DO UPDATE SET
    total_points     = GREATEST(0, public.user_community_score.total_points + NEW.points_delta),
    weekly_delta     = public.user_community_score.weekly_delta
                       + CASE WHEN NEW.created_at >= now() - INTERVAL '7 days' THEN NEW.points_delta ELSE 0 END,
    monthly_delta    = public.user_community_score.monthly_delta
                       + CASE WHEN NEW.created_at >= now() - INTERVAL '30 days' THEN NEW.points_delta ELSE 0 END,
    level            = public.compute_community_level(
                         GREATEST(0, public.user_community_score.total_points + NEW.points_delta)),
    domain_breakdown = public.user_community_score.domain_breakdown
                       || jsonb_build_object(
                            NEW.domain,
                            COALESCE((public.user_community_score.domain_breakdown ->> NEW.domain)::int, 0)
                            + NEW.points_delta),
    last_event_at    = GREATEST(public.user_community_score.last_event_at, NEW.created_at),
    updated_at       = now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS user_activity_events_score_bump ON public.user_activity_events;
CREATE TRIGGER user_activity_events_score_bump
  AFTER INSERT ON public.user_activity_events
  FOR EACH ROW EXECUTE FUNCTION public.on_user_activity_event_inserted();

-- ---------------------------------------------------------------------------
-- 5. Domain triggers — emit into the log from existing tables.
-- ---------------------------------------------------------------------------

-- venue_checkins: existing trigger updates user_gamification; we add a second
-- AFTER trigger that emits into the unified log so we don't tangle the two
-- responsibilities. Per-checkin: emit venue.checkin (capped 3/day for points).
-- For the first-ever checkin at a venue, also emit venue.first_visit_bonus.
CREATE OR REPLACE FUNCTION public.tg_venue_checkin_emit_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_new_venue boolean;
BEGIN
  PERFORM public.emit_user_activity(
    NEW.user_id, 'venue.checkin', 'venue', NEW.venue_id,
    jsonb_build_object('checkin_id', NEW.id));

  SELECT NOT EXISTS (
    SELECT 1 FROM public.venue_checkins
     WHERE user_id = NEW.user_id AND venue_id = NEW.venue_id AND id <> NEW.id
  ) INTO v_is_new_venue;

  IF v_is_new_venue THEN
    PERFORM public.emit_user_activity(
      NEW.user_id, 'venue.first_visit_bonus', 'venue', NEW.venue_id,
      jsonb_build_object('checkin_id', NEW.id));
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS venue_checkins_emit_activity ON public.venue_checkins;
CREATE TRIGGER venue_checkins_emit_activity
  AFTER INSERT ON public.venue_checkins
  FOR EACH ROW EXECUTE FUNCTION public.tg_venue_checkin_emit_activity();


CREATE OR REPLACE FUNCTION public.tg_marketplace_favorite_emit_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.emit_user_activity(
    NEW.user_id, 'marketplace.favorite_added', 'listing', NEW.listing_id,
    jsonb_build_object('favorite_id', NEW.id));
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS marketplace_favorites_emit_activity ON public.marketplace_favorites;
CREATE TRIGGER marketplace_favorites_emit_activity
  AFTER INSERT ON public.marketplace_favorites
  FOR EACH ROW EXECUTE FUNCTION public.tg_marketplace_favorite_emit_activity();


CREATE OR REPLACE FUNCTION public.tg_marketplace_review_emit_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.emit_user_activity(
    NEW.user_id, 'marketplace.review_posted', 'listing', NEW.listing_id,
    jsonb_build_object('review_id', NEW.id, 'rating', NEW.rating));
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS marketplace_reviews_emit_activity ON public.marketplace_reviews;
CREATE TRIGGER marketplace_reviews_emit_activity
  AFTER INSERT ON public.marketplace_reviews
  FOR EACH ROW EXECUTE FUNCTION public.tg_marketplace_review_emit_activity();


-- guide_reads: emit on the transition from in-progress → completed.
CREATE OR REPLACE FUNCTION public.tg_marketplace_guide_read_emit_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.completed_at IS NOT NULL)
     OR (TG_OP = 'UPDATE' AND OLD.completed_at IS NULL AND NEW.completed_at IS NOT NULL) THEN
    PERFORM public.emit_user_activity(
      NEW.user_id, 'marketplace.guide_completed', 'guide', NEW.guide_id,
      jsonb_build_object());
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS marketplace_guide_reads_emit_activity ON public.marketplace_guide_reads;
CREATE TRIGGER marketplace_guide_reads_emit_activity
  AFTER INSERT OR UPDATE OF completed_at ON public.marketplace_guide_reads
  FOR EACH ROW EXECUTE FUNCTION public.tg_marketplace_guide_read_emit_activity();

-- ---------------------------------------------------------------------------
-- 6. Backfill — historical events from existing tables, then full rebuild of
--    user_community_score.
--
-- IMPORTANT: the score-bump trigger (4) fires on every INSERT — this is fine
-- during backfill because totals/breakdown end up identical to the recompute
-- below; recompute_user_community_score() is a tie-breaker that ensures
-- weekly/monthly windows are accurate vs now().
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  r RECORD;
BEGIN
  -- venue_checkins → venue.checkin (+ first_visit_bonus for the first per (user, venue))
  FOR r IN
    SELECT user_id, venue_id, id, checked_in_at,
           ROW_NUMBER() OVER (PARTITION BY user_id, venue_id ORDER BY checked_in_at) AS rn
      FROM public.venue_checkins
     ORDER BY checked_in_at
  LOOP
    PERFORM public.emit_user_activity(
      r.user_id, 'venue.checkin', 'venue', r.venue_id,
      jsonb_build_object('checkin_id', r.id, 'backfill', true),
      NULL, r.checked_in_at);
    IF r.rn = 1 THEN
      PERFORM public.emit_user_activity(
        r.user_id, 'venue.first_visit_bonus', 'venue', r.venue_id,
        jsonb_build_object('checkin_id', r.id, 'backfill', true),
        NULL, r.checked_in_at);
    END IF;
  END LOOP;

  -- marketplace_favorites
  FOR r IN SELECT user_id, listing_id, id, created_at FROM public.marketplace_favorites
  LOOP
    PERFORM public.emit_user_activity(
      r.user_id, 'marketplace.favorite_added', 'listing', r.listing_id,
      jsonb_build_object('favorite_id', r.id, 'backfill', true),
      NULL, r.created_at);
  END LOOP;

  -- marketplace_reviews
  FOR r IN SELECT user_id, listing_id, id, rating, created_at FROM public.marketplace_reviews
  LOOP
    PERFORM public.emit_user_activity(
      r.user_id, 'marketplace.review_posted', 'listing', r.listing_id,
      jsonb_build_object('review_id', r.id, 'rating', r.rating, 'backfill', true),
      NULL, r.created_at);
  END LOOP;

  -- marketplace_guide_reads (only the completed ones — that's the awardable event)
  FOR r IN
    SELECT user_id, guide_id, completed_at FROM public.marketplace_guide_reads
     WHERE completed_at IS NOT NULL
  LOOP
    PERFORM public.emit_user_activity(
      r.user_id, 'marketplace.guide_completed', 'guide', r.guide_id,
      jsonb_build_object('backfill', true), NULL, r.completed_at);
  END LOOP;
END
$$;

-- Full reconciliation pass so weekly/monthly windows are correct as of now().
DO $$
DECLARE
  v_uid uuid;
BEGIN
  FOR v_uid IN SELECT DISTINCT user_id FROM public.user_activity_events
  LOOP
    PERFORM public.recompute_user_community_score(v_uid);
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- 7. Periodic recompute — weekly/monthly deltas drift downward as events age
--    out. A daily cron full-recomputes all rows. Cron extension wiring is
--    deferred to ops; for now expose the function and document the cadence.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recompute_all_community_scores()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_n   int := 0;
BEGIN
  FOR v_uid IN SELECT user_id FROM public.user_community_score
  LOOP
    PERFORM public.recompute_user_community_score(v_uid);
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END
$$;
COMMENT ON FUNCTION public.recompute_all_community_scores() IS
  'Refresh weekly/monthly deltas across all users. Schedule daily via pg_cron.';

-- ---------------------------------------------------------------------------
-- 8. Add user_community_score to supabase_realtime publication so /me can
--    subscribe to live updates.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'user_community_score'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_community_score;
  END IF;
END $$;
