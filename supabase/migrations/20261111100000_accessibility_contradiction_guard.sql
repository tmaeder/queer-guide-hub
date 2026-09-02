-- Accessibility contradicting pairs: vocabulary, resolver, trigger, sentinel.
--
-- THE DEFECT THIS CLOSES
-- ----------------------
-- `_shared/venue-consensus.ts` votes `accessibility_attributes` as kind:'array',
-- and array fields UNION their contributors: every source counts as agreeing, so
-- an array field can NEVER register a conflict. HIGH_RISK_FIELDS was only
-- {name, latitude, longitude, category}, so accessibility was not caught there
-- either. OSM `wheelchair=no` and Google `wheelchairAccessibleEntrance=true`
-- would therefore BOTH survive on one venue and auto-commit at high confidence
-- rather than gate to review.
--
-- Measured against prod 2026-08-30: latent on VENUES (0 pairs, the column is
-- populated on 6 rows) — but NOT latent on events. One event is already
-- publishing both halves:
--
--   7c11d7f7-c2c6-498c-94b6-f75a2c045e47
--   "2ND JUNE: Scrapbooking & Zine Making Workshop", Dalston Superstore, London
--   accessibility_attributes = {accessible-restroom, no-accessible-restroom, ramp-access}
--
-- Its provenance names the cause exactly. `event-agentic-enrich` extracted
-- `level-access-toilet` AND `no-wheelchair-access-to-toilet` from one page;
-- normalize_event_accessibility mapped them to the two halves of a pair and
-- faithfully preserved both, as it is designed to. Nothing downstream then
-- asked whether they could both be true.
--
-- The event's own accessibility_notes settle it: "There is a small step up to
-- the entrance, but a ramp is available on request. THE TOILET IS NOT
-- WHEELCHAIR ACCESSIBLE, and additional toilets are located down a narrow
-- spiral staircase." So `level-access-toilet` was the extractor's error and
-- keep-the-negative lands on the truth. That is one case, not a proof — but it
-- is the only real one in the corpus and the policy gets it right.
--
-- 20260801150524 states the stake: "a wrong access claim strands a disabled
-- person at a door they cannot get through."
--
-- WHY A TRIGGER AND NOT A FIX IN THE WRITER
-- -----------------------------------------
-- `venues.accessibility_attributes` has at least four writers —
-- amenity-truth-backfill (extract/places/llm), venue-accessibility-osm,
-- approve_venue_review, and the CMS — and events has its own. Patching one
-- leaves the rest, which is exactly how a human "approve" in the triage inbox
-- did nothing for as long as the inbox existed (20260916120000). The invariant
-- belongs at the table.
--
-- RESOLUTION POLICY: KEEP THE NEGATIVE.
-- A traveller wrongly told a door is step-free arrives and cannot get in; a
-- traveller wrongly told it is not merely goes elsewhere. The two errors are not
-- symmetric. The conflict is never swallowed: the pair is recorded on the row
-- and needs_attention is raised, so a person can still settle it.

-- ---------------------------------------------------------------------------
-- 1. Vocabulary columns.
-- ---------------------------------------------------------------------------
ALTER TABLE public.amenities
  ADD COLUMN IF NOT EXISTS contradicts text,
  ADD COLUMN IF NOT EXISTS is_negative_assertion boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.amenities.contradicts IS
  'Slug this term cannot coexist with on one entity. Symmetric: both rows point at each other. Mirrored in supabase/functions/_shared/accessibility-vocab.ts (ACCESSIBILITY_CONTRADICTIONS), kept in step by accessibility-vocab.drift.test.ts.';
COMMENT ON COLUMN public.amenities.is_negative_assertion IS
  'True for terms that assert the ABSENCE of an accommodation. Decides which half of a contradicting pair survives: the negative one. Never collapse a negative into silence.';

-- ---------------------------------------------------------------------------
-- 2. Two terms OSM can express that the vocabulary could not.
--
--    `limited-wheelchair-access` is neither pole. OSM `wheelchair=limited` means
--    partly accessible; rounding it up to a promise or down to a refusal both
--    misreport it, so it gets its own term and contradicts nothing.
-- ---------------------------------------------------------------------------
INSERT INTO public.amenities (slug, name, icon_name, kind, category_scope, sort_order, is_active)
VALUES
  ('limited-wheelchair-access', 'Limited wheelchair access', 'Accessibility', 'accessibility', array['all'], 695, true),
  ('tactile-paving',            'Tactile paving',            'Footprints',    'accessibility', array['all'], 780, true)
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. The pairs. Written [positive, negative] — the ORDER is load-bearing and the
--    drift test parses exactly this block. Both directions are stored so either
--    side of a pair can find its opposite in one lookup.
-- ---------------------------------------------------------------------------
WITH pairs(positive_slug, negative_slug) AS (
  VALUES
    ('wheelchair-accessible', 'not-wheelchair-accessible'),
    ('step-free-entrance',    'not-step-free'),
    ('accessible-restroom',   'no-accessible-restroom')
)
UPDATE public.amenities a
SET contradicts = CASE WHEN a.slug = p.positive_slug THEN p.negative_slug ELSE p.positive_slug END,
    is_negative_assertion = (a.slug = p.negative_slug)
FROM pairs p
WHERE a.slug IN (p.positive_slug, p.negative_slug);

-- Every pair must be complete and symmetric in BOTH directions. A half-seeded
-- pair silently disables the guard for that accommodation.
DO $$
DECLARE v_bad int;
BEGIN
  SELECT count(*) INTO v_bad
  FROM public.amenities a
  WHERE a.contradicts IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.amenities b
      WHERE b.slug = a.contradicts AND b.contradicts = a.slug
        AND b.is_negative_assertion <> a.is_negative_assertion
    );
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'accessibility contradiction pairs are not symmetric: % row(s)', v_bad;
  END IF;

  SELECT count(*) INTO v_bad FROM public.amenities WHERE contradicts IS NOT NULL;
  IF v_bad <> 6 THEN
    RAISE EXCEPTION 'expected 6 paired rows (3 pairs x 2 directions), found %', v_bad;
  END IF;
END $$;

-- Every slug _shared/osm-accessibility.ts can emit must EXIST and be ACTIVE. A
-- slug the vocabulary lacks is written and then default-rejected downstream,
-- which renders as "no data" — indistinguishable from never having looked.
DO $$
DECLARE v_missing text[];
BEGIN
  SELECT array_agg(s) INTO v_missing
  FROM unnest(array[
    'accessible-parking','accessible-restroom','elevator-access','gender-neutral-restroom',
    'hearing-loop','limited-wheelchair-access','no-accessible-restroom','not-step-free',
    'not-wheelchair-accessible','ramp-access','step-free-entrance','tactile-paving',
    'wheelchair-accessible'
  ]) s
  WHERE NOT EXISTS (
    SELECT 1 FROM public.amenities a
    WHERE a.slug = s AND a.kind = 'accessibility' AND a.is_active
  );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'osm-accessibility.ts emits slugs absent from the vocabulary: %', v_missing;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. The resolver. Pure, vocabulary-driven, idempotent: its own output
--    re-resolves to itself. Deliberately does NOT default-reject unknown terms —
--    that is the writers' job, and silently deleting a value a human typed is a
--    different decision from settling a contradiction.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_accessibility_conflicts(p_raw text[])
RETURNS text[]
LANGUAGE sql STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT coalesce(array_agg(DISTINCT v ORDER BY v), '{}'::text[])
  FROM unnest(coalesce(p_raw, '{}'::text[])) v
  WHERE v IS NOT NULL AND btrim(v) <> ''
    -- Drop v only when v is the POSITIVE half and its negative is also asserted.
    AND NOT EXISTS (
      SELECT 1 FROM public.amenities a
      WHERE a.slug = v
        AND a.contradicts IS NOT NULL
        AND NOT a.is_negative_assertion
        AND a.contradicts = ANY(p_raw)
    );
$function$;

COMMENT ON FUNCTION public.resolve_accessibility_conflicts(text[]) IS
  'Drops the POSITIVE half of every contradicting accessibility pair, keeping the negative. Idempotent. A wrong "accessible" strands someone at a door; a wrong "not accessible" only sends them elsewhere.';

-- What was dropped, for the row stamp and the sentinel.
CREATE OR REPLACE FUNCTION public.accessibility_conflict_pairs(p_raw text[])
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT coalesce(jsonb_agg(jsonb_build_array(a.slug, a.contradicts) ORDER BY a.slug), '[]'::jsonb)
  FROM public.amenities a
  WHERE a.contradicts IS NOT NULL
    AND NOT a.is_negative_assertion
    AND a.slug = ANY(coalesce(p_raw, '{}'::text[]))
    AND a.contradicts = ANY(coalesce(p_raw, '{}'::text[]));
$function$;

-- ---------------------------------------------------------------------------
-- 5. The trigger. Deliberately UNSCOPED (not `UPDATE OF accessibility_attributes`):
--    a column-scoped trigger fires on the columns named in the UPDATE STATEMENT,
--    not on what a BEFORE trigger mutated, so a future writer that sets the array
--    from another BEFORE trigger would slip past it — the exact shape that left a
--    venue in a criminalizing country publicly visible (20260807100200). The
--    early return makes the unscoped form free on every unrelated write.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_entity_accessibility()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_resolved text[];
  v_conflicts jsonb;
BEGIN
  -- Fewer than two values cannot hold a pair. This is the early return that
  -- makes an UNSCOPED trigger free on the ~99.98% of venue writes that touch
  -- nothing here.
  IF coalesce(cardinality(NEW.accessibility_attributes), 0) < 2 THEN
    RETURN NEW;
  END IF;

  -- Deliberately NO `NEW IS NOT DISTINCT FROM OLD` short-circuit. Skipping
  -- unchanged values would make the trigger blind to a row that ALREADY holds a
  -- pair, so a contradiction written before this migration (or by a path that
  -- got around it) could never heal on a later touch — and `UPDATE t SET x = x`,
  -- the obvious way to re-run a guard over a corpus, would silently do nothing.
  v_conflicts := public.accessibility_conflict_pairs(NEW.accessibility_attributes);
  IF v_conflicts = '[]'::jsonb THEN
    RETURN NEW;
  END IF;

  v_resolved := public.resolve_accessibility_conflicts(NEW.accessibility_attributes);
  NEW.accessibility_attributes := v_resolved;

  -- Record WHAT was dropped and WHEN. Resolving silently would destroy the only
  -- evidence that two sources disagree about a door, which is precisely what a
  -- reviewer needs to see.
  NEW.enrichment_status := jsonb_set(
    coalesce(NEW.enrichment_status, '{}'::jsonb),
    '{accessibility_conflict}',
    jsonb_build_object('pairs', v_conflicts, 'kept', to_jsonb(v_resolved), 'at', now()),
    true
  );
  NEW.needs_attention := true;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.resolve_entity_accessibility() IS
  'BEFORE trigger: settles contradicting accessibility pairs in favour of the negative, stamps enrichment_status.accessibility_conflict and raises needs_attention. Unscoped by design — a column-scoped trigger cannot see a write made by another BEFORE trigger.';

DROP TRIGGER IF EXISTS trg_venues_accessibility_resolve ON public.venues;
CREATE TRIGGER trg_venues_accessibility_resolve
  BEFORE INSERT OR UPDATE ON public.venues
  FOR EACH ROW EXECUTE FUNCTION public.resolve_entity_accessibility();

DROP TRIGGER IF EXISTS trg_events_accessibility_resolve ON public.events;
CREATE TRIGGER trg_events_accessibility_resolve
  BEFORE INSERT OR UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.resolve_entity_accessibility();

-- ---------------------------------------------------------------------------
-- 6. One-shot repair, so the zero-tolerance sentinel below is honest from its
--    first run rather than red on day one with a baseline allowance bolted on.
--
--    Both corpora are tiny for this column (measured on prod 2026-08-30: 6
--    venues and 279 events carry ANY accessibility value, and exactly ONE row
--    across both tables holds a pair), so the per-row search-index cost that
--    caps every other backfill on these tables does not bite here. If that ever
--    stops being true, batch it — a 300-row events UPDATE costs 14.6s, of which
--    13.8s is trg_search_documents_event.
-- ---------------------------------------------------------------------------
--    The repair writes the resolved value and the stamp EXPLICITLY rather than
--    relying on the trigger's side effects. The trigger would in fact do it, but
--    a one-shot that silently depends on trigger internals is the kind of thing
--    that turns into a no-op the moment someone adds a short-circuit.
DO $$
DECLARE v_v int; v_e int;
BEGIN
  WITH fixed AS (
    UPDATE public.venues v
    SET accessibility_attributes = public.resolve_accessibility_conflicts(v.accessibility_attributes),
        needs_attention = true,
        enrichment_status = jsonb_set(
          coalesce(v.enrichment_status, '{}'::jsonb), '{accessibility_conflict}',
          jsonb_build_object(
            'pairs', public.accessibility_conflict_pairs(v.accessibility_attributes),
            'kept', to_jsonb(public.resolve_accessibility_conflicts(v.accessibility_attributes)),
            'at', now(), 'repair', '20261111100000'), true)
    WHERE public.accessibility_conflict_pairs(v.accessibility_attributes) <> '[]'::jsonb
    RETURNING 1
  ) SELECT count(*) INTO v_v FROM fixed;

  WITH fixed AS (
    UPDATE public.events e
    SET accessibility_attributes = public.resolve_accessibility_conflicts(e.accessibility_attributes),
        needs_attention = true,
        enrichment_status = jsonb_set(
          coalesce(e.enrichment_status, '{}'::jsonb), '{accessibility_conflict}',
          jsonb_build_object(
            'pairs', public.accessibility_conflict_pairs(e.accessibility_attributes),
            'kept', to_jsonb(public.resolve_accessibility_conflicts(e.accessibility_attributes)),
            'at', now(), 'repair', '20261111100000'), true)
    WHERE public.accessibility_conflict_pairs(e.accessibility_attributes) <> '[]'::jsonb
    RETURNING 1
  ) SELECT count(*) INTO v_e FROM fixed;

  RAISE NOTICE 'accessibility contradiction repair: % venue(s), % event(s)', v_v, v_e;
END $$;

-- ---------------------------------------------------------------------------
-- 7. Sentinel. Body transcribed verbatim from the live definition
--    (20261001100200) with ONE key added — the established pattern for this
--    function (20260916120000 and 20261001100200 both did the same).
--
--    ZERO-TOLERANCE, NO BASELINE. The trigger makes this state unreachable, so
--    one row means a writer bypassed it — a COPY, a disabled trigger, or a table
--    that grew an accessibility column without one. It is its own key rather
--    than part of a broader quality count for the stranded_human_approved
--    reason: 14 rows hid under a 3,500-row warn floor for 40 days, and this
--    corpus is smaller still.
--
--    Deliberately WIDER than the trigger: the trigger only fires on INSERT and
--    UPDATE of these two tables, while this counts the state itself wherever it
--    ends up.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pipeline_hygiene_stats()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'cron_total', (SELECT count(*) FROM cron.job WHERE active),
    'legacy_cron_jobs', COALESCE((
      SELECT jsonb_agg(jobname) FROM cron.job
      WHERE jobname IN (
        'pipeline-venue-validate', 'pipeline-venue-dedup', 'pipeline-venue-commit',
        'pipeline-event-validate', 'pipeline-event-dedup', 'pipeline-event-commit'
      )
      OR jobname LIKE 'translate-i18n-%'
      OR jobname LIKE 'tag\_i18n\_%' ESCAPE '\'
    ), '[]'::jsonb),
    'i18n_percombo_cron_count', (
      SELECT count(*) FROM cron.job
      WHERE jobname LIKE 'i18n\_%' ESCAPE '\'
        AND jobname NOT IN ('i18n_translation_dispatch')
    ),
    'staging_pending_review', (
      SELECT count(*) FROM public.ingestion_staging
      WHERE review_status = 'pending_review' AND disposition = 'pending'
    ),
    'unregistered_cron_jobs', COALESCE((
      SELECT jsonb_agg(j.jobname) FROM cron.job j
      WHERE j.active
        AND NOT EXISTS (
          SELECT 1 FROM public.admin_automations a
          WHERE a.action->>'jobname' = j.jobname
             OR a.slug = lower(regexp_replace(j.jobname, '[^a-zA-Z0-9]+', '_', 'g'))
        )
    ), '[]'::jsonb),
    -- 2026-08 overhaul P2: rows stuck mid-pipeline. This is the generalized
    -- form of the leak that spawned the per-stage drain crons (rows staged
    -- outside a pipeline run never draining). Keyed by target_table (the
    -- router key; entity_type spellings are inconsistent in old rows).
    'stale_pending_by_entity', COALESCE((
      SELECT jsonb_object_agg(target_table, n) FROM (
        SELECT target_table, count(*) AS n
        FROM public.ingestion_staging
        WHERE disposition = 'pending'
          AND created_at < now() - interval '48 hours'
        GROUP BY target_table
      ) s
    ), '{}'::jsonb),
    -- 2026-08-22: a human approved it and nothing downstream can see it. This
    -- is a subset of stale_pending_by_entity that its thresholds could never
    -- surface — 14 rows hid under a 3,500-row warn floor for 40 days — and it
    -- is worse than ordinary starvation, because a person was asked, answered,
    -- and the answer was dropped.
    'stranded_human_approved', COALESCE((
      SELECT jsonb_object_agg(target_table, n) FROM (
        SELECT target_table, count(*) AS n
        FROM public.ingestion_staging
        WHERE disposition = 'pending'
          AND review_status = 'approved'
          AND ai_validation_status IS DISTINCT FROM 'approved'
        GROUP BY target_table
      ) s
    ), '{}'::jsonb),
    -- 2026-08-30: an entity asserting both halves of a contradicting
    -- accessibility pair — "wheelchair accessible" AND "not wheelchair
    -- accessible" at once. trg_*_accessibility_resolve makes this unreachable
    -- through INSERT/UPDATE, so any count here is a writer that got around it.
    -- Zero-tolerance in check-pipeline-health.mjs: no baseline, no floor.
    'accessibility_contradictions', COALESCE((
      SELECT jsonb_object_agg(entity, n) FROM (
        SELECT 'venues' AS entity, count(DISTINCT v.id) AS n
        FROM public.venues v
        WHERE v.duplicate_of_id IS NULL
          AND cardinality(v.accessibility_attributes) > 1
          AND public.accessibility_conflict_pairs(v.accessibility_attributes) <> '[]'::jsonb
        HAVING count(*) > 0
        UNION ALL
        SELECT 'events', count(DISTINCT e.id)
        FROM public.events e
        WHERE cardinality(e.accessibility_attributes) > 1
          AND public.accessibility_conflict_pairs(e.accessibility_attributes) <> '[]'::jsonb
        HAVING count(*) > 0
      ) s
    ), '{}'::jsonb),
    'search_reindex_queue_depth', (
      SELECT count(*) FROM public.search_reindex_queue
    ),
    -- 2026-08-25: city duplication. Every existing unique key on `cities` keys
    -- on the string, so the class that survives is "same place, different
    -- string" — and nothing counted it. near_pairs is the population the
    -- coordinate sweep arm works from; the other four are the health of the
    -- machinery that is supposed to keep it from growing.
    'city_dup_signals', jsonb_build_object(
      'near_pairs', (
        WITH live AS (
          SELECT c.id, c.country_id, c.latitude AS lat, c.longitude AS lng,
                 c.wikidata_qid AS qid,
                 floor(c.latitude * 5)::int AS gy, floor(c.longitude * 5)::int AS gx
          FROM public.cities c
          WHERE c.duplicate_of_id IS NULL
            AND c.latitude IS NOT NULL AND c.longitude IS NOT NULL
        )
        SELECT count(*) FROM live a JOIN live b
          ON a.country_id = b.country_id AND a.id < b.id
         AND b.gy BETWEEN a.gy - 1 AND a.gy + 1
         AND b.gx BETWEEN a.gx - 1 AND a.gx + 1
         AND public.haversine_m(a.lat, a.lng, b.lat, b.lng) < 2000
         -- Two distinct QIDs are two distinct entities: a district beside its
         -- own city is not a duplicate and must never be counted as one.
         AND NOT (a.qid IS NOT NULL AND b.qid IS NOT NULL AND a.qid <> b.qid)
      ),
      'qid_coverage_pct', (
        SELECT CASE WHEN count(*) = 0 THEN 100
               ELSE round(100.0 * count(*) FILTER (WHERE wikidata_qid IS NOT NULL) / count(*))::int END
        FROM public.cities WHERE duplicate_of_id IS NULL
      ),
      'cities_without_aliases', (
        SELECT count(*) FROM public.cities c
        WHERE c.duplicate_of_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM public.city_aliases a WHERE a.city_id = c.id)
      ),
      'alias_rows', (SELECT count(*) FROM public.city_aliases),
      'resolve_queue_pending', (
        SELECT count(*) FROM public.city_resolve_queue WHERE state = 'pending'
      ),
      'resolve_queue_oldest_pending_hours', (
        SELECT coalesce(round(extract(epoch FROM now() - min(created_at)) / 3600)::int, 0)
        FROM public.city_resolve_queue WHERE state = 'pending'
      ),
      -- name_normalized is '' for any name with no [a-z0-9] character, which is
      -- every city whose primary name is in Greek, Japanese, Korean, Hebrew,
      -- Cyrillic, Georgian, Thai, Khmer or Lao. The partial unique index
      -- uk_cities_country_name_active (country_id, name_normalized) therefore
      -- admits exactly ONE such city per country — measured 2026-08-25: 27 rows
      -- over 27 distinct countries, which is the index, not the world. Tracked
      -- rather than fixed here: changing that index is a separate decision.
      'empty_name_normalized', (
        SELECT count(*) FROM public.cities
        WHERE duplicate_of_id IS NULL AND coalesce(name_normalized, '') = ''
      )
    )
  );
$function$;

-- The repair above must have left nothing behind. Asserting it here rather than
-- waiting for CI means a migration that cannot clean the corpus fails loudly
-- instead of shipping a sentinel that is red on arrival.
DO $$
DECLARE v_left jsonb;
BEGIN
  SELECT public.pipeline_hygiene_stats()->'accessibility_contradictions' INTO v_left;
  IF v_left <> '{}'::jsonb THEN
    RAISE EXCEPTION 'accessibility contradictions survive the repair: %', v_left;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.resolve_accessibility_conflicts(text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accessibility_conflict_pairs(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_accessibility_conflicts(text[]) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.accessibility_conflict_pairs(text[]) TO service_role, authenticated;
