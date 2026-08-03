-- Event taxonomy write-gate
--
-- Problem this closes
-- -------------------
-- 1. `commit_event_staging_item` lost its event_type whitelist. The baseline had
--    `v_valid_event_types` + lower() + an 'other' fallback; every revision since
--    20260415120100 uses a bare `coalesce(nullif(v_norm->>'event_type',''),'other')`.
--    Meanwhile source-gaycities emits 'LGBTQ+ Event', source-ticketmaster emits
--    'screening' and 'event', source-eventbrite emits 'event'. Those raise
--    events_event_type_check at commit and kill the WHOLE staging item, not just
--    the field.
-- 2. normalize_event_target_groups / normalize_event_accessibility /
--    normalize_age_restriction (all added 2026-08-01) are called by nothing outside
--    their own one-shot backfills. event-agentic-enrich has been writing raw LLM
--    output straight back into the columns those backfills cleaned.
--
-- Why a trigger rather than another patch to the commit RPC: the commit RPC is only
-- one of several writers (agentic enrich, admin CMS, CSV import, the direct-insert
-- importers). A BEFORE trigger gates all of them at once and cannot be bypassed by a
-- new writer added later.
--
-- The trigger is deliberately NOT column-scoped. A column-scoped trigger fires on the
-- columns named in the UPDATE *statement*, not on what an earlier BEFORE trigger
-- mutated -- the defect documented for trg_venues_safety_gated in 20260807100200.

-- ---------------------------------------------------------------------------------
-- Make normalize_event_accessibility idempotent BEFORE anything calls it repeatedly.
--
-- It was written as a one-shot cleanup over raw LLM phrasing ("wheelchair accessible",
-- "step free"), so its CASE arms match human text, not its own output slugs. Feeding it
-- the values it previously produced destroys 11 of the 18 slugs currently stored on
-- events -- including accessible-restroom, step-free-entrance, sign-language-interpreted
-- and the negative assertion no-accessible-restroom, which is first-class vocabulary
-- that must never be collapsed or silently dropped.
--
-- Under a BEFORE trigger that would mean every future UPDATE to an event quietly erased
-- its accessibility data. A wrong accessibility claim -- including a wrongly-absent one
-- -- is real-world harm, so canonical values now pass through untouched and only
-- non-canonical input reaches the phrase matcher. All 18 stored values were verified to
-- be active `amenities` rows with kind='accessibility' before this was written.
--
-- The phrase matcher is renamed rather than rewritten so its tested logic is preserved
-- verbatim.
ALTER FUNCTION public.normalize_event_accessibility(text[])
  RENAME TO normalize_event_accessibility_phrases;

CREATE OR REPLACE FUNCTION public.normalize_event_accessibility(p_raw text[])
RETURNS text[]
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT coalesce(array_agg(DISTINCT s.slug ORDER BY s.slug), '{}'::text[])
  FROM (
    -- Already canonical: pass through, never re-derive.
    SELECT v AS slug
    FROM unnest(coalesce(p_raw, '{}'::text[])) AS v
    WHERE EXISTS (
      SELECT 1 FROM public.amenities a
      WHERE a.slug = v AND a.kind = 'accessibility' AND a.is_active
    )
    UNION
    -- Everything else is raw phrasing; default-reject still applies.
    SELECT n
    FROM unnest(coalesce(p_raw, '{}'::text[])) AS v
    CROSS JOIN LATERAL unnest(
      public.normalize_event_accessibility_phrases(ARRAY[v])
    ) AS n
    WHERE NOT EXISTS (
      SELECT 1 FROM public.amenities a
      WHERE a.slug = v AND a.kind = 'accessibility' AND a.is_active
    )
  ) s;
$$;

COMMENT ON FUNCTION public.normalize_event_accessibility(text[]) IS
  'Idempotent accessibility normalizer: canonical amenities slugs pass through, raw '
  'phrasing is routed to normalize_event_accessibility_phrases, unknown input is '
  'dropped. Safe to call on every write.';

CREATE OR REPLACE FUNCTION public.normalize_event_taxonomy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  -- Must stay identical to events_event_type_check and to src/lib/eventTypes.ts.
  v_valid CONSTANT text[] := ARRAY[
    'party','festival','pride','fetish','community','meetup','conference',
    'workshop','concert','film','drag','sports','art','theater','fundraiser',
    'protest','social','fair','cruise','comedy','exhibition','other'
  ];
BEGIN
  NEW.event_type := lower(btrim(coalesce(NEW.event_type, '')));
  IF NEW.event_type = '' OR NOT (NEW.event_type = ANY (v_valid)) THEN
    NEW.event_type := 'other';
  END IF;

  -- Each normalizer is default-reject: an unrecognised term is dropped rather than
  -- stored. That is the same contract normalize_venue_tags has at the venue commit
  -- gate, and it is what keeps LLM free-text out of columns that are exact-match
  -- filters and live search facets.
  IF NEW.target_groups IS NOT NULL THEN
    NEW.target_groups := public.normalize_event_target_groups(NEW.target_groups);
  END IF;

  IF NEW.accessibility_attributes IS NOT NULL THEN
    NEW.accessibility_attributes :=
      public.normalize_event_accessibility(NEW.accessibility_attributes);
  END IF;

  IF NEW.age_restriction IS NOT NULL THEN
    NEW.age_restriction := public.normalize_age_restriction(NEW.age_restriction);
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.normalize_event_taxonomy() IS
  'Single write-gate for events.event_type + the three vocabulary columns. Whitelists '
  'event_type (illegal -> other, never an exception) and routes target_groups / '
  'accessibility_attributes / age_restriction through their default-reject normalizers.';

DROP TRIGGER IF EXISTS trg_events_taxonomy ON public.events;
CREATE TRIGGER trg_events_taxonomy
  BEFORE INSERT OR UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.normalize_event_taxonomy();
