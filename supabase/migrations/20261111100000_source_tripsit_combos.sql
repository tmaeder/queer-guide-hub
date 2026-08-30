-- Recurring TripSit sync for `public.substance_interactions`.
--
-- WHAT WAS WRONG. `20260909172500` loaded 421 TripSit pairs and nothing ever
-- refreshed them: no cron, no `admin_automations` row, no `ingestion_sources`
-- row, no sentinel anywhere. Measured on production 2026-08-30 the whole cohort
-- still read `fetched_at = 2026-08-15`. The page answers "can I combine these
-- two?", so a rating nobody has re-checked is a claim we are making on our own
-- authority while printing someone else's name under it.
--
-- THE TABLE IS MULTI-SOURCE AND THE UNIQUE KEY IS NOT. It also holds 48
-- eve&rave Substanzhandbuch rows and 7 FDA-label rows, and
-- `substance_interactions_pair_uniq` is unique across ALL of them. So the
-- dangerous shape is not a careless `delete from substance_interactions` — it
-- is an ordinary upsert: the day TripSit starts publishing a pair eve&rave
-- already holds, `on conflict do update` silently replaces that row's rating,
-- its note and its attribution. Every write below is therefore scoped to
-- `source = 'tripsit'` and a pair held by another source is skipped and
-- reported, never overwritten.
--
-- AN EMPTY OR TRUNCATED 200 IS NOT AN ANSWER (the Overpass lesson). Upstream is
-- a file on GitHub; a proxy, a partial read or a future schema change can all
-- produce a well-formed document with far fewer pairs in it. Read as data that
-- would RETRACT interaction warnings. The floors below refuse the entire
-- transaction — the deletes with it — rather than letting absence of evidence
-- publish itself as evidence of absence.
--
-- `fetched_at` MOVES ON EVERY VISIT, `updated_at` ONLY ON CHANGE. That split is
-- the whole point of the exercise: staleness has to be measurable
-- independently of whether upstream happened to change anything, or the
-- sentinel in `scripts/check-pipeline-health.mjs` cannot tell a source that is
-- being re-checked and is stable from one that stopped running in August.

-- Snapshot taken before anything else runs, so section 5 can assert this
-- migration did not touch a row it has no business touching. Session-lifetime,
-- NOT `ON COMMIT DROP`: that would make this file depend on being run inside a
-- transaction, and vanish between here and section 5 under plain autocommit.
DROP TABLE IF EXISTS _tripsit_migration_snapshot;
CREATE TEMP TABLE _tripsit_migration_snapshot AS
SELECT count(*) AS foreign_rows FROM public.substance_interactions WHERE source <> 'tripsit';

-- ----------------------------------------------------------------------------
-- 0. Circuit breaker. `checkCircuit` returns allowed when the row is ABSENT, so
--    `withCircuitBreaker(supabase, 'tripsit', ...)` in the edge function is only
--    half of it — wikipedia.api, wikidata.api and osm.nominatim were
--    unprotected for their whole lives for exactly this reason. 5 failures,
--    300s reset: the upstream is a static file and a run is once a week, so a
--    short window is enough to survive a GitHub blip without pinning the
--    breaker open until the next run.
-- ----------------------------------------------------------------------------
SELECT public.register_circuit_breaker('tripsit', 5, 300);

-- ----------------------------------------------------------------------------
-- 1. The sync RPC. One transaction, every guard inside it.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_tripsit_interactions(
  p_rows       jsonb,
  p_fetched_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
-- pg_temp is named EXPLICITLY AND LAST. This body creates temp tables, and with
-- a bare `SET search_path = public` the temp schema is searched implicitly
-- FIRST — which both resolves and is the documented hijack surface for a
-- SECURITY DEFINER function. Naming it last makes the resolution deliberate and
-- puts `public` in front of anything a caller could pre-create.
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_asserted    int;
  v_seen        int;
  v_writable    int;
  v_existing    int;
  v_changed     int;
  v_stamped     int := 0;
  v_inserted    int := 0;
  v_unresolved  jsonb;
  v_collapsed   jsonb;
  v_conflicts   jsonb;
  v_deleted     jsonb;
  v_bad_status  jsonb;
  -- The status CHECK on the table, restated so this function can DECLINE a
  -- value instead of aborting on it. See the note at the canon table below.
  c_statuses    constant text[] := array[
    'dangerous', 'unsafe', 'caution',
    'low_risk_decrease', 'low_risk_no_synergy', 'low_risk_synergy', 'unknown'];
  -- Absolute floor. Upstream has charted at least 25 substances since 2019 and
  -- 31 (421 pairs) since before the original import; 300 is comfortably below
  -- any real corpus and far above any truncation worth writing.
  c_min_pairs   constant int := 300;
BEGIN
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'sync_tripsit_interactions: p_rows must be a json array, got %',
      coalesce(jsonb_typeof(p_rows), 'null');
  END IF;

  -- Resolve slugs to tags. `unified_tags_slug_key` makes slug unique, so this
  -- left join cannot multiply rows. An unresolved slug is REPORTED, never
  -- guessed: the caller maps upstream keys through an explicit table precisely
  -- because two of them have live slug twins that are dead tags
  -- (`amphetamines` merged, `mushrooms` deprecated), and every read RPC filters
  -- `unified_tags.status = 'active'`, so a row filed against one of those would
  -- satisfy every constraint and render nowhere.
  -- ON COMMIT DROP leaves these standing until the transaction ends, so two
  -- calls in one transaction would collide. PostgREST gives each RPC its own
  -- transaction, but a batch script or a DO block would not.
  DROP TABLE IF EXISTS _tripsit_feed;
  DROP TABLE IF EXISTS _tripsit_canon;

  CREATE TEMP TABLE _tripsit_feed ON COMMIT DROP AS
  SELECT
    r->>'slug_a'              AS slug_a,
    r->>'slug_b'              AS slug_b,
    nullif(r->>'status', '')  AS status,
    nullif(r->>'note', '')    AS note,
    r->>'source_pair'         AS source_pair,
    ta.id                     AS tag_a,
    tb.id                     AS tag_b
  FROM jsonb_array_elements(p_rows) AS r
  LEFT JOIN public.unified_tags ta ON ta.slug = r->>'slug_a'
  LEFT JOIN public.unified_tags tb ON tb.slug = r->>'slug_b';

  SELECT jsonb_agg(jsonb_build_object(
           'source_pair', source_pair,
           'unresolved', (CASE WHEN tag_a IS NULL THEN jsonb_build_array(slug_a) ELSE '[]'::jsonb END)
                      || (CASE WHEN tag_b IS NULL THEN jsonb_build_array(slug_b) ELSE '[]'::jsonb END))
           ORDER BY source_pair)
    INTO v_unresolved
    FROM _tripsit_feed
   WHERE tag_a IS NULL OR tag_b IS NULL;

  -- Two upstream keys collapsing onto one tag would violate the canonical-order
  -- CHECK rather than fail quietly. Not reachable with today's map; recorded so
  -- that if the map ever grows a duplicate it reads as a mapping bug and not as
  -- a mysterious constraint violation.
  SELECT jsonb_agg(source_pair ORDER BY source_pair) INTO v_collapsed
    FROM _tripsit_feed WHERE tag_a IS NOT NULL AND tag_a = tag_b;

  SELECT jsonb_agg(DISTINCT status) INTO v_bad_status
    FROM _tripsit_feed WHERE status IS NOT NULL AND NOT (status = ANY (c_statuses));

  -- Canonical order is the schema's, not a convention: `tag_a_id < tag_b_id`.
  -- DISTINCT ON keeps the result stable if two upstream pairs ever collapse
  -- onto the same tag pair.
  --
  -- A status outside the CHECK vocabulary is nulled here rather than trusted.
  -- The caller already maps upstream labels and emits null for one it does not
  -- recognise, but that rule would then live only in TypeScript: passing a raw
  -- label straight through aborts the whole transaction on the CHECK, so ONE
  -- new severity tier upstream would stop the entire sync — including the
  -- provenance stamp on the other 420 rows — instead of leaving one row alone.
  -- The invariant belongs where the constraint is.
  CREATE TEMP TABLE _tripsit_canon ON COMMIT DROP AS
  SELECT DISTINCT ON (a, b) a, b, status, note, source_pair
    FROM (
      SELECT least(tag_a, tag_b) AS a, greatest(tag_a, tag_b) AS b,
             CASE WHEN status = ANY (c_statuses) THEN status ELSE NULL END AS status,
             note, source_pair
        FROM _tripsit_feed
       WHERE tag_a IS NOT NULL AND tag_b IS NOT NULL AND tag_a <> tag_b
    ) s
   ORDER BY a, b, source_pair;

  SELECT count(DISTINCT source_pair) INTO v_asserted FROM _tripsit_feed;
  SELECT count(*) INTO v_seen     FROM _tripsit_canon;
  SELECT count(*) INTO v_writable FROM _tripsit_canon WHERE status IS NOT NULL;
  SELECT count(*) INTO v_existing FROM public.substance_interactions WHERE source = 'tripsit';

  -- The floors govern DELETION, so they are measured on every pair the feed
  -- ASSERTS, not on the subset we could resolve. Measuring the resolved subset
  -- was the first draft and it was wrong by 28 rows: renaming one upstream
  -- substance key makes all ~28 of its pairs unresolvable, which passes a 10%
  -- shrink test on 421 and then deletes them. A row we could not parse is not a
  -- row upstream retracted, and the delete predicate below honours the same
  -- distinction by protecting any `source_pair` the feed still names.
  IF v_asserted < c_min_pairs THEN
    RAISE EXCEPTION
      'sync_tripsit_interactions: feed asserted only % pairs (floor %) — refusing to treat a truncated fetch as a retraction',
      v_asserted, c_min_pairs;
  END IF;
  IF v_existing > 0 AND v_asserted < (v_existing * 0.9)::int THEN
    RAISE EXCEPTION
      'sync_tripsit_interactions: feed asserted % pairs against % stored (>10%% shrink) — refusing; re-run with a verified feed or drop the rows deliberately',
      v_asserted, v_existing;
  END IF;

  -- Pairs another source already owns. Skipped, not overwritten — the unique
  -- index spans every source, so this is the only thing standing between a
  -- TripSit refresh and eve&rave's attribution.
  SELECT jsonb_agg(jsonb_build_object('source_pair', c.source_pair, 'held_by', si.source)
                   ORDER BY c.source_pair)
    INTO v_conflicts
    FROM _tripsit_canon c
    JOIN public.substance_interactions si
      ON si.tag_a_id = c.a AND si.tag_b_id = c.b
   WHERE si.source <> 'tripsit';

  SELECT count(*) INTO v_changed
    FROM _tripsit_canon c
    JOIN public.substance_interactions si
      ON si.tag_a_id = c.a AND si.tag_b_id = c.b AND si.source = 'tripsit'
   WHERE c.status IS NOT NULL
     AND (si.status IS DISTINCT FROM c.status OR si.note IS DISTINCT FROM c.note);

  -- Every matched TripSit row gets the provenance stamp; only a row whose
  -- content actually moved gets `updated_at`. In SET, references to the target
  -- table are the OLD values, which is what makes the comparison work here.
  --
  -- `c.status IS NULL` means the upstream severity label is one we do not
  -- recognise. The rating and note are then left EXACTLY as they are rather
  -- than being coerced to our `unknown`, which means "no rating published" and
  -- would silently turn a new upstream tier into a shrug.
  UPDATE public.substance_interactions si
     SET status      = coalesce(c.status, si.status),
         note        = CASE WHEN c.status IS NULL THEN si.note ELSE c.note END,
         source_pair = c.source_pair,
         fetched_at  = p_fetched_at,
         updated_at  = CASE
                         WHEN c.status IS NOT NULL
                          AND (si.status IS DISTINCT FROM c.status OR si.note IS DISTINCT FROM c.note)
                         THEN p_fetched_at ELSE si.updated_at
                       END
    FROM _tripsit_canon c
   WHERE si.tag_a_id = c.a AND si.tag_b_id = c.b AND si.source = 'tripsit';
  GET DIAGNOSTICS v_stamped = ROW_COUNT;

  -- NOT EXISTS rather than ON CONFLICT: it declines both the rows just updated
  -- and — the point — any pair another source holds.
  INSERT INTO public.substance_interactions
    (tag_a_id, tag_b_id, status, note, source, source_url, source_pair, fetched_at, updated_at)
  SELECT c.a, c.b, c.status, c.note, 'tripsit', 'https://combo.tripsit.me/',
         c.source_pair, p_fetched_at, p_fetched_at
    FROM _tripsit_canon c
   WHERE c.status IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.substance_interactions si
        WHERE si.tag_a_id = c.a AND si.tag_b_id = c.b
     );
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- Retraction. A row attributed to TripSit that TripSit no longer publishes is
  -- a false attribution, so it goes — but only under the floors above, only for
  -- rows this source owns, and the deleted pairs are returned so the removal of
  -- a safety rating is visible in the run record rather than inferred from a
  -- shrinking count.
  --
  -- THE SECOND ARM IS WHAT MAKES "RETRACTED" MEAN RETRACTED. A pair whose slug
  -- we could not resolve is absent from `_tripsit_canon` and would otherwise be
  -- indistinguishable from one upstream dropped, so renaming a single substance
  -- key silently deleted 28 ratings (measured). `source_pair` is the upstream
  -- key pair and is stored on every row for exactly this kind of diffing, so a
  -- pair the feed still NAMES is protected even when we cannot resolve it —
  -- it lands in `unresolved_pairs` for a human instead. Both sides are in
  -- sorted `lo|hi` order: the parser emits that form and the UPDATE above
  -- rewrites it, and all 421 stored rows already match it.
  WITH del AS (
    DELETE FROM public.substance_interactions si
     WHERE si.source = 'tripsit'
       AND NOT EXISTS (
         SELECT 1 FROM _tripsit_canon c WHERE c.a = si.tag_a_id AND c.b = si.tag_b_id
       )
       AND (
         si.source_pair IS NULL
         OR NOT EXISTS (SELECT 1 FROM _tripsit_feed f WHERE f.source_pair = si.source_pair)
       )
    RETURNING si.source_pair, si.status
  )
  SELECT jsonb_agg(jsonb_build_object('source_pair', source_pair, 'status', status)
                   ORDER BY source_pair)
    INTO v_deleted FROM del;

  RETURN jsonb_build_object(
    'fetched_at',        p_fetched_at,
    'pairs_asserted',    v_asserted,
    'pairs_seen',        v_seen,
    'pairs_writable',    v_writable,
    'existing_before',   v_existing,
    'stamped',           v_stamped,
    'changed',           v_changed,
    'inserted',          v_inserted,
    'deleted',           coalesce(v_deleted, '[]'::jsonb),
    'foreign_source_conflicts', coalesce(v_conflicts, '[]'::jsonb),
    'unresolved_pairs',  coalesce(v_unresolved, '[]'::jsonb),
    'collapsed_pairs',   coalesce(v_collapsed, '[]'::jsonb),
    'rejected_statuses', coalesce(v_bad_status, '[]'::jsonb)
  );
END
$fn$;

-- This writes safety content. `20260806130000` is the record of twelve merge
-- cores shipping anon-callable; service_role only, and PUBLIC revoked first
-- because CREATE FUNCTION grants EXECUTE to PUBLIC by default.
REVOKE ALL ON FUNCTION public.sync_tripsit_interactions(jsonb, timestamptz) FROM public;
REVOKE ALL ON FUNCTION public.sync_tripsit_interactions(jsonb, timestamptz) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_tripsit_interactions(jsonb, timestamptz) TO service_role;

COMMENT ON FUNCTION public.sync_tripsit_interactions(jsonb, timestamptz) IS
  'Refreshes the source=tripsit half of substance_interactions from combos.json. Scoped to that source: a pair another source holds is skipped, never overwritten. Refuses the whole transaction, deletes included, if the feed shrinks implausibly.';

-- ----------------------------------------------------------------------------
-- 2. Registry row FIRST. `admin_automations` is the record of record;
--    `sync_automations_to_cron()` recreates any enabled row whose job is
--    missing, so a bare `cron.unschedule` is undone by the next reconciler pass
--    and retirement means disabling this row, never deleting it.
--
--    WEEKLY, NOT NIGHTLY. Upstream is a hand-curated file in a git repository
--    that has not changed shape since before the original import; the useful
--    question this answers is "is anyone still checking?", and once a week
--    answers it. Nightly would rewrite `fetched_at` on 421 rows for no new
--    information — cheap here (no search trigger on this table) but pointless.
--
--    `timeout_milliseconds` IS SET EXPLICITLY. pg_net's default is 5s and a
--    response arriving later is recorded `timed_out` -> `partial`, which never
--    touches `consecutive_failures` — so a job that always overruns the default
--    can neither auto-pause nor read as failing. 55s covers one ~500 KB fetch
--    plus a single RPC round trip.
--
--    The command is the PLAIN readable form. `admin_automation_effective_
--    command()` derives the run-tracking wrapper; a pre-wrapped command here is
--    re-wrapped and breaks.
-- ----------------------------------------------------------------------------
INSERT INTO admin_automations (slug, name, description, trigger, action, schedule, enabled, managed_by)
VALUES (
  'source_tripsit',
  'TripSit drug-interaction matrix sync',
  'Fetches github.com/TripSit/drugs combos.json (31 substances, 421 unordered pairs) and refreshes the source=tripsit rows of substance_interactions via sync_tripsit_interactions. Stamps fetched_at on every visit so staleness is measurable; updated_at only when a rating or note actually changed. The eve&rave Substanzhandbuch and FDA-label rows in the same table are never touched.',
  jsonb_build_object('type', 'schedule'),
  jsonb_build_object(
    'type', 'cron',
    'jobname', 'source_tripsit',
    'command', $cmd$
  select net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/source-tripsit',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'X-Internal-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := jsonb_build_object('triggered_by', 'cron'),
    timeout_milliseconds := 55000
  ) as request_id;
  $cmd$
  ),
  '40 4 * * 2',
  true,
  'system'
)
ON CONFLICT (slug) DO UPDATE
  SET enabled     = true,
      schedule    = excluded.schedule,
      action      = excluded.action,
      description = excluded.description;

-- ----------------------------------------------------------------------------
-- 3. The cron job, derived from the registry row above.
-- ----------------------------------------------------------------------------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'source_tripsit') THEN
    PERFORM cron.unschedule('source_tripsit');
  END IF;
END $$;

DO $sched$
DECLARE
  v_cmd text;
  v_sched text;
BEGIN
  SELECT action->>'command', schedule INTO v_cmd, v_sched
    FROM admin_automations WHERE slug = 'source_tripsit';
  PERFORM cron.schedule('source_tripsit', v_sched, v_cmd);
END
$sched$;

-- ----------------------------------------------------------------------------
-- 4. ingestion_sources — the admin-facing source list.
--    `requires_api_key` is TEXT (it names the key), not a boolean: NULL is
--    "none required", which is the truth here. combos.json is public.
-- ----------------------------------------------------------------------------
INSERT INTO public.ingestion_sources
  (name, slug, source_type, target_table, edge_function, is_enabled, requires_api_key, schedule)
VALUES
  ('TripSit drug interactions', 'tripsit', 'api', 'substance_interactions', 'source-tripsit', true, NULL, '40 4 * * 2')
ON CONFLICT (slug) DO UPDATE
  SET name          = EXCLUDED.name,
      source_type   = EXCLUDED.source_type,
      target_table  = EXCLUDED.target_table,
      edge_function = EXCLUDED.edge_function,
      is_enabled    = EXCLUDED.is_enabled,
      schedule      = EXCLUDED.schedule,
      updated_at    = now();

-- ----------------------------------------------------------------------------
-- 5. Assert both sides. A `cron.schedule` inside a migration is not durable on
--    its own: `20260820191944` issued exactly this statement to move the
--    detect-stale-venues threshold and it silently never took, leaving the
--    registry and the live job disagreeing for two weeks while the flag climbed
--    to 99.5% of live venues. Verify here rather than trusting the statement.
-- ----------------------------------------------------------------------------
DO $verify$
DECLARE
  v_sched text;
  v_cmd   text;
  v_n     int;
  v_foreign_before int;
BEGIN
  SELECT foreign_rows INTO v_foreign_before FROM _tripsit_migration_snapshot;
  IF NOT EXISTS (SELECT 1 FROM admin_automations WHERE slug = 'source_tripsit' AND enabled) THEN
    RAISE EXCEPTION 'source_tripsit registry row missing or disabled';
  END IF;

  SELECT schedule, command INTO v_sched, v_cmd FROM cron.job WHERE jobname = 'source_tripsit';
  IF v_sched IS NULL THEN
    RAISE EXCEPTION 'source_tripsit cron job was not created';
  END IF;
  IF v_sched <> '40 4 * * 2' THEN
    RAISE EXCEPTION 'source_tripsit cron schedule drifted at creation: %', v_sched;
  END IF;
  IF v_cmd NOT LIKE '%source-tripsit%' THEN
    RAISE EXCEPTION 'source_tripsit cron command does not target the function: %', left(v_cmd, 120);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.ingestion_sources WHERE slug = 'tripsit' AND is_enabled) THEN
    RAISE EXCEPTION 'tripsit ingestion_sources row missing or disabled';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.api_circuit_breakers WHERE api_name = 'tripsit') THEN
    RAISE EXCEPTION 'tripsit circuit breaker not registered — checkCircuit allows by default and it could never trip';
  END IF;

  -- The function is service_role-only. anon holding EXECUTE on a writer of
  -- safety content is the exact shape `20260806130000` had to revoke.
  IF has_function_privilege('anon', 'public.sync_tripsit_interactions(jsonb, timestamptz)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.sync_tripsit_interactions(jsonb, timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION 'sync_tripsit_interactions is callable by anon/authenticated';
  END IF;

  -- This migration must not touch a single interaction row — it only DEFINES
  -- the sync. Asserted as "unchanged since the snapshot above", not as a
  -- literal count: prod holds 55 non-tripsit rows today, but a replay from
  -- scratch reaches this file with whatever `20261003110300` managed to insert,
  -- and a hardcoded floor would then fail for a reason that has nothing to do
  -- with this change.
  SELECT count(*) INTO v_n FROM public.substance_interactions WHERE source <> 'tripsit';
  IF v_n <> v_foreign_before THEN
    RAISE EXCEPTION 'this migration changed non-tripsit interaction rows (% -> %) — it must only define the sync',
      v_foreign_before, v_n;
  END IF;
END
$verify$;
