-- Contributor Recognition Wall
--
-- Annual editorial recognition page (/contributors/:year) crediting top contributors.
-- Curated by editorial team (+ Guardian-tier vote later). NOT a live leaderboard.
--
-- Tables:
--   * contributor_recognitions       — curated annual list (year + user + blurb + category)
--   * contributor_mailing_addresses  — opt-in mailing address for print zine (separate, locked)
--   * contribution_metrics_yearly    — materialized view (per user per year aggregates)
--
-- Opt-in: profiles.privacy_settings ->> 'appear_in_recognition' (default false)

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. contributor_recognitions
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.contributor_recognitions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year        integer NOT NULL CHECK (year BETWEEN 2024 AND 2100),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category    text NOT NULL CHECK (category IN (
    'venue_scout',
    'history_documentarian',
    'safety_reporter',
    'translator',
    'quest_lead',
    'community',
    'editorial'
  )),
  blurb_md    text,
  display_name_override text,  -- optional pseudonym for safety
  featured    boolean NOT NULL DEFAULT false,
  opted_in    boolean NOT NULL DEFAULT false,
  rank        integer,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES auth.users(id),
  UNIQUE (year, user_id, category)
);

CREATE INDEX IF NOT EXISTS idx_contributor_recognitions_year
  ON public.contributor_recognitions (year, opted_in, featured DESC, rank NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_contributor_recognitions_user
  ON public.contributor_recognitions (user_id);

CREATE OR REPLACE FUNCTION public.contributor_recognitions_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contributor_recognitions_updated_at ON public.contributor_recognitions;
CREATE TRIGGER trg_contributor_recognitions_updated_at
  BEFORE UPDATE ON public.contributor_recognitions
  FOR EACH ROW EXECUTE FUNCTION public.contributor_recognitions_set_updated_at();

ALTER TABLE public.contributor_recognitions ENABLE ROW LEVEL SECURITY;

-- Public read: only opted_in rows, only via the view below (defense in depth)
CREATE POLICY contributor_recognitions_public_read
  ON public.contributor_recognitions
  FOR SELECT
  TO anon, authenticated
  USING (opted_in = true);

-- Admin/moderator full access
CREATE POLICY contributor_recognitions_admin_all
  ON public.contributor_recognitions
  FOR ALL
  TO authenticated
  USING (public.has_any_role_jwt(ARRAY['admin'::public.app_role, 'moderator'::public.app_role]))
  WITH CHECK (public.has_any_role_jwt(ARRAY['admin'::public.app_role, 'moderator'::public.app_role]));

GRANT SELECT ON public.contributor_recognitions TO anon, authenticated;
GRANT ALL ON public.contributor_recognitions TO service_role;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. contributor_mailing_addresses (separate, locked-down — print zine only)
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.contributor_mailing_addresses (
  user_id      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient    text NOT NULL,
  line1        text NOT NULL,
  line2        text,
  city         text NOT NULL,
  region       text,
  postal_code  text,
  country_code text NOT NULL CHECK (length(country_code) = 2),
  notes        text,
  opted_in_zine boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_contributor_mailing_addresses_updated_at ON public.contributor_mailing_addresses;
CREATE TRIGGER trg_contributor_mailing_addresses_updated_at
  BEFORE UPDATE ON public.contributor_mailing_addresses
  FOR EACH ROW EXECUTE FUNCTION public.contributor_recognitions_set_updated_at();

ALTER TABLE public.contributor_mailing_addresses ENABLE ROW LEVEL SECURITY;

-- Owner: read + write own row
CREATE POLICY contributor_mailing_addresses_owner_select
  ON public.contributor_mailing_addresses FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY contributor_mailing_addresses_owner_upsert
  ON public.contributor_mailing_addresses FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY contributor_mailing_addresses_owner_update
  ON public.contributor_mailing_addresses FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY contributor_mailing_addresses_owner_delete
  ON public.contributor_mailing_addresses FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Admin only (not moderator — addresses are PII).
CREATE POLICY contributor_mailing_addresses_admin_select
  ON public.contributor_mailing_addresses FOR SELECT
  TO authenticated
  USING (public.has_role_jwt('admin'::public.app_role));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contributor_mailing_addresses TO authenticated;
GRANT ALL ON public.contributor_mailing_addresses TO service_role;

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. contribution_metrics_yearly  (materialized view)
--
-- Aggregates per-user-per-year contribution signals to inform curation.
-- Sources today: community_submissions (accepted). Extend later for
-- safety signals, quests, translations once those tables ship.
-- ──────────────────────────────────────────────────────────────────────────────

DROP MATERIALIZED VIEW IF EXISTS public.contribution_metrics_yearly;

CREATE MATERIALIZED VIEW public.contribution_metrics_yearly AS
WITH submissions AS (
  SELECT
    cs.submitted_by                                   AS user_id,
    EXTRACT(YEAR FROM cs.submitted_at)::int           AS year,
    COUNT(*) FILTER (WHERE cs.status = 'approved')    AS accepted_submissions,
    COUNT(*) FILTER (
      WHERE cs.status = 'approved' AND cs.content_type = 'venue'
    )                                                 AS venue_submissions,
    COUNT(*) FILTER (
      WHERE cs.status = 'approved' AND cs.content_type = 'event'
    )                                                 AS event_submissions,
    COUNT(*) FILTER (
      WHERE cs.status = 'approved' AND cs.content_type = 'personality'
    )                                                 AS personality_submissions,
    COUNT(*)                                          AS total_submissions
  FROM public.community_submissions cs
  WHERE cs.submitted_by IS NOT NULL
  GROUP BY cs.submitted_by, EXTRACT(YEAR FROM cs.submitted_at)::int
)
SELECT
  s.user_id,
  s.year,
  s.accepted_submissions,
  s.venue_submissions,
  s.event_submissions,
  s.personality_submissions,
  0::bigint AS safety_signals,
  0::bigint AS quest_completions,
  0::bigint AS translations,
  s.total_submissions,
  s.accepted_submissions
    + 0  -- placeholder for safety_signals
    + 0  -- placeholder for quest_completions
    + 0  -- placeholder for translations
                                                       AS contribution_score
FROM submissions s;

CREATE UNIQUE INDEX IF NOT EXISTS idx_contribution_metrics_yearly_pk
  ON public.contribution_metrics_yearly (user_id, year);

CREATE INDEX IF NOT EXISTS idx_contribution_metrics_yearly_year_score
  ON public.contribution_metrics_yearly (year, contribution_score DESC);

-- Admin / moderator only — raw metrics expose contribution patterns.
REVOKE ALL ON public.contribution_metrics_yearly FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.contribution_metrics_yearly TO service_role;

CREATE OR REPLACE FUNCTION public.refresh_contribution_metrics_yearly()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_any_role_jwt(ARRAY['admin'::public.app_role, 'moderator'::public.app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.contribution_metrics_yearly;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_contribution_metrics_yearly() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_contribution_metrics_yearly() TO authenticated;

-- Admin-only RPC to read metrics for a year (so admin UI doesn't need direct GRANT).
CREATE OR REPLACE FUNCTION public.contribution_metrics_for_year(p_year integer)
RETURNS TABLE (
  user_id uuid,
  display_name text,
  avatar_url text,
  year integer,
  accepted_submissions bigint,
  venue_submissions bigint,
  event_submissions bigint,
  personality_submissions bigint,
  safety_signals bigint,
  quest_completions bigint,
  translations bigint,
  total_submissions bigint,
  contribution_score bigint,
  appear_in_recognition boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_any_role_jwt(ARRAY['admin'::public.app_role, 'moderator'::public.app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT
      m.user_id,
      p.display_name,
      p.avatar_url,
      m.year,
      m.accepted_submissions,
      m.venue_submissions,
      m.event_submissions,
      m.personality_submissions,
      m.safety_signals,
      m.quest_completions,
      m.translations,
      m.total_submissions,
      m.contribution_score,
      COALESCE((p.privacy_settings ->> 'appear_in_recognition')::boolean, false)
    FROM public.contribution_metrics_yearly m
    LEFT JOIN public.profiles p ON p.user_id = m.user_id
    WHERE m.year = p_year
    ORDER BY m.contribution_score DESC NULLS LAST, m.accepted_submissions DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.contribution_metrics_for_year(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.contribution_metrics_for_year(integer) TO authenticated;

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. Public-safe view: recognition + display name (joins profile)
-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.contributor_recognitions_public
WITH (security_invoker = true) AS
SELECT
  cr.id,
  cr.year,
  cr.category,
  cr.blurb_md,
  cr.featured,
  cr.rank,
  COALESCE(NULLIF(cr.display_name_override, ''), p.display_name, 'Anonymous contributor') AS display_name,
  p.avatar_url,
  cr.user_id
FROM public.contributor_recognitions cr
LEFT JOIN public.profiles p ON p.user_id = cr.user_id
WHERE cr.opted_in = true;

GRANT SELECT ON public.contributor_recognitions_public TO anon, authenticated;

-- ──────────────────────────────────────────────────────────────────────────────
-- 5. Seed year-in-review email template
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO public.email_templates (template_key, name, description, subject, html_content, text_content, variables, is_active)
VALUES (
  'recognition_year_in_review',
  'Year-in-Review — Recognition Wall',
  'Annual email naming community contributors. Sent to all opted-in recipients when the recognition page goes live.',
  'queer.guide {{year}} — the people who made it',
  $HTML$<!doctype html>
<html><body style="font-family:Inter,system-ui,sans-serif;color:#0a0a0a;background:#fff;max-width:560px;margin:0 auto;padding:32px 24px;line-height:1.5">
  <h1 style="font-size:24px;font-weight:600;margin:0 0 16px">{{year}} in names.</h1>
  <p>This year, {{contributor_count}} people shaped queer.guide.</p>
  <p>Venue scouts, history documentarians, safety reporters, translators across 11 languages. No leaderboard. A credits roll.</p>
  <p style="margin:24px 0"><a href="https://queer.guide/contributors/{{year}}" style="color:#0a0a0a;text-decoration:underline;font-weight:500">Read the {{year}} Recognition Wall →</a></p>
  <p style="margin-top:32px;color:#666;font-size:13px">You're receiving this because you contributed in {{year}} or subscribed to community updates. You can opt out of being named publicly in your profile settings.</p>
</body></html>$HTML$,
  $TEXT$queer.guide {{year}} — the people who made it

This year, {{contributor_count}} people shaped queer.guide.

Venue scouts, history documentarians, safety reporters, translators across 11 languages. No leaderboard. A credits roll.

Read the {{year}} Recognition Wall: https://queer.guide/contributors/{{year}}

You're receiving this because you contributed in {{year}} or subscribed to community updates. You can opt out of being named publicly in your profile settings.$TEXT$,
  '[{"key":"year","label":"Year","example":"2026"},{"key":"contributor_count","label":"Contributor count","example":"127"}]'::jsonb,
  true
)
ON CONFLICT (template_key) DO NOTHING;
