-- ============================================================================
-- Point the four remaining quality triage views at the UNIFIED review queue
--
-- The B1 consolidation (20260801130000) renamed the five per-entity review
-- tables to `*_legacy`, created ONE `public.entity_review_queue`, and put
-- auto-updatable compat VIEWS back under the original names. It reasoned that
-- "the RPCs still see their tables" — and that is TRUE, because plpgsql
-- resolves relation names at RUNTIME, so approve_city_review() &co. followed
-- the name onto the new compat view and kept working.
--
-- A VIEW does not work that way. Its rewrite rule stores the base relation by
-- OID, so `ALTER TABLE ... RENAME TO ..._legacy` silently REPOINTED every
-- dependent view onto the renamed, now-drained table. That is what happened to
-- the five `triage_src_quality_*` views from 20260801050000: their definitions
-- read `city_review_queue_legacy` etc. — 0 rows — while the real rows sat in
-- entity_review_queue.
--
-- The failure signature is precisely this asymmetry, and it is why nobody
-- noticed for a month: `get_admin_counts` is a FUNCTION, so its static block
-- (`SELECT count(*) FROM city_review_queue WHERE status='open'`) followed the
-- name to the compat view and kept reporting the TRUE counts on the Quality
-- hub cards, while the registry-driven loop in the same function counts
-- `FROM triage_src_quality_city` and reported 0. Right badge, empty list.
--
-- Measured open rows hidden in /admin/inbox at the time of writing (2026-08-15):
--   city 691, venue 807, village 217, marketplace 0 (604 approved /
--   781 rejected historically) — 1,715 open reviews invisible.
--
-- `triage_src_quality_personality` was already repointed by
-- 20260815110116_personality_adult_links_engine.sql, which fixed only its own
-- view and left this one explicitly as a separate change. This is that change,
-- and it copies that view's shape exactly.
--
-- The action path needs nothing: triage_action dispatches these queue_keys to
-- approve_/reject_<entity>_review, which are plpgsql and so already operate on
-- the unified rows through the compat views. The row `id`s were preserved by
-- the B1 backfill, so an id surfaced here resolves in those RPCs unchanged.
--
-- SHAPE IS A CONTRACT. triage_sources.view_name points at these and
-- triage_action reads the columns positionally-by-name, so column NAMES, ORDER
-- and TYPES are reproduced exactly; the only edit is the FROM/JOIN and the
-- entity_type predicate. `q.<entity>_id AS entity_id` becomes a plain
-- `q.entity_id` — same name, same uuid type.
-- ============================================================================

-- ── 0. Capture reloptions ───────────────────────────────────────────────────
--
-- CREATE OR REPLACE VIEW resets `reloptions` to NULL, silently discarding a
-- prior `ALTER VIEW ... SET (security_invoker = true)` and turning an invoker
-- view back into a SECURITY DEFINER one that bypasses base-table RLS (proven
-- on prod, 2026-08-03; the definer-view gate keys on write grants and is blind
-- to a stripped view whose writes were already revoked).
--
-- These four are NOT in `security_invoker_required_views`, so they are
-- expected to be definer by design like the other triage_src_* views and this
-- should be a no-op. Captured and restored anyway rather than asserted, so the
-- migration is correct whichever way the live reloptions actually read.

CREATE TEMP TABLE _triage_view_opts ON COMMIT DROP AS
SELECT c.oid, c.relname, c.reloptions
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public'
   AND c.relkind = 'v'
   AND c.relname IN ('triage_src_quality_city', 'triage_src_quality_venue',
                     'triage_src_quality_village', 'triage_src_quality_marketplace');

-- ── 1. City ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.triage_src_quality_city AS
SELECT
  q.id,
  'quality-city'::text AS queue_type,
  'cities'::text AS content_type,
  coalesce(c.name, 'City') || ' — ' || q.field AS title,
  coalesce(q.model, 'engine') AS subtitle,
  q.status,
  q.confidence::numeric AS confidence_score,
  q.created_at,
  'city-truth-engine'::text AS source,
  q.entity_id,
  'cities'::text AS entity_table,
  true AS has_diff,
  NULL::uuid AS reporter_id,
  jsonb_build_object(
    'field', q.field,
    'proposed_value', q.proposed_value,
    'citations', q.citations,
    'model', q.model
  ) AS meta,
  NULL::text AS flag_type,
  -- Unchanged: safety_notes for a criminalizing destination is an outing risk
  -- and approve_city_review demands p_confirm for it.
  CASE WHEN q.field IN ('safety_notes', 'lgbt_friendly_rating')
       THEN jsonb_build_object('safety', true, 'confirm_may_be_required', true)
       ELSE '{}'::jsonb END AS risk_flags
FROM public.entity_review_queue q
LEFT JOIN public.cities c ON c.id = q.entity_id
WHERE q.status = 'open'
  AND q.entity_type = 'city';

-- ── 2. Venue ────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.triage_src_quality_venue AS
SELECT
  q.id,
  'quality-venue'::text AS queue_type,
  'venues'::text AS content_type,
  coalesce(v.name, 'Venue') || ' — ' || q.field AS title,
  coalesce(q.model, 'engine') AS subtitle,
  q.status,
  q.confidence::numeric AS confidence_score,
  q.created_at,
  'venue-truth-engine'::text AS source,
  q.entity_id,
  'venues'::text AS entity_table,
  true AS has_diff,
  NULL::uuid AS reporter_id,
  jsonb_build_object(
    'field', q.field,
    'proposed_value', q.proposed_value,
    'citations', q.citations,
    'model', q.model
  ) AS meta,
  NULL::text AS flag_type,
  CASE WHEN q.field = 'accessibility_attributes'
       THEN jsonb_build_object('accessibility', true)
       ELSE '{}'::jsonb END AS risk_flags
FROM public.entity_review_queue q
LEFT JOIN public.venues v ON v.id = q.entity_id
WHERE q.status = 'open'
  AND q.entity_type = 'venue';

-- ── 3. Village ──────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.triage_src_quality_village AS
SELECT
  q.id,
  'quality-village'::text AS queue_type,
  'queer_villages'::text AS content_type,
  coalesce(vv.name, 'Village') || ' — ' || q.field AS title,
  coalesce(q.model, 'engine') AS subtitle,
  q.status,
  q.confidence::numeric AS confidence_score,
  q.created_at,
  'village-truth-engine'::text AS source,
  q.entity_id,
  'queer_villages'::text AS entity_table,
  true AS has_diff,
  NULL::uuid AS reporter_id,
  jsonb_build_object(
    'field', q.field,
    'proposed_value', q.proposed_value,
    'citations', q.citations,
    'model', q.model
  ) AS meta,
  NULL::text AS flag_type,
  '{}'::jsonb AS risk_flags
FROM public.entity_review_queue q
LEFT JOIN public.queer_villages vv ON vv.id = q.entity_id
WHERE q.status = 'open'
  AND q.entity_type = 'village';

-- ── 4. Marketplace ──────────────────────────────────────────────────────────
--
-- 0 open rows today. Repointed anyway: the enrichers write to the unified
-- queue, so the next listing review would land in the same blind spot.

CREATE OR REPLACE VIEW public.triage_src_quality_marketplace AS
SELECT
  q.id,
  'quality-marketplace'::text AS queue_type,
  'marketplace_listings'::text AS content_type,
  coalesce(ml.title, 'Listing') || ' — ' || q.field AS title,
  coalesce(q.model, 'engine') AS subtitle,
  q.status,
  q.confidence::numeric AS confidence_score,
  q.created_at,
  'marketplace-engine'::text AS source,
  q.entity_id,
  'marketplace_listings'::text AS entity_table,
  true AS has_diff,
  NULL::uuid AS reporter_id,
  jsonb_build_object(
    'field', q.field,
    'proposed_value', q.proposed_value,
    'citations', q.citations,
    'model', q.model
  ) AS meta,
  NULL::text AS flag_type,
  '{}'::jsonb AS risk_flags
FROM public.entity_review_queue q
LEFT JOIN public.marketplace_listings ml ON ml.id = q.entity_id
WHERE q.status = 'open'
  AND q.entity_type = 'marketplace';

-- ── 5. Restore reloptions ───────────────────────────────────────────────────

DO $restore$
DECLARE r record;
BEGIN
  FOR r IN SELECT relname, reloptions FROM _triage_view_opts WHERE reloptions IS NOT NULL
  LOOP
    EXECUTE format('ALTER VIEW public.%I SET (%s)', r.relname,
                   array_to_string(r.reloptions, ', '));
    RAISE NOTICE 'restored reloptions on %: %', r.relname, r.reloptions;
  END LOOP;
END $restore$;

-- ── 6. Grants ───────────────────────────────────────────────────────────────
--
-- CREATE OR REPLACE keeps the same pg_class row and its ACL, so the read grant
-- from 20260801050000 and the anon revoke from 20260806180000 both survive.
-- Restated so the intended end state is not implicit.

GRANT SELECT ON
  public.triage_src_quality_city, public.triage_src_quality_venue,
  public.triage_src_quality_village, public.triage_src_quality_marketplace
TO authenticated;

REVOKE ALL ON
  public.triage_src_quality_city, public.triage_src_quality_venue,
  public.triage_src_quality_village, public.triage_src_quality_marketplace
FROM anon;

-- ── 7. Self-verification ────────────────────────────────────────────────────
--
-- Fails the migration if ANY registered triage view still depends on a drained
-- `*_legacy` relation — i.e. catches the same rename trap for the whole family
-- rather than trusting that these four were the only casualties.

DO $verify$
DECLARE v_bad text;
BEGIN
  SELECT string_agg(DISTINCT v.relname || ' -> ' || src.relname, ', ')
    INTO v_bad
    FROM pg_rewrite rw
    JOIN pg_class v ON v.oid = rw.ev_class
    JOIN pg_namespace n ON n.oid = v.relnamespace
    JOIN pg_depend d ON d.objid = rw.oid AND d.classid = 'pg_rewrite'::regclass
    JOIN pg_class src ON src.oid = d.refobjid
   WHERE n.nspname = 'public'
     AND v.relname LIKE 'triage\_src\_%'
     AND src.relname LIKE '%\_legacy'
     AND src.oid <> v.oid;

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'triage view still reads a drained legacy table: %', v_bad
      USING ERRCODE = '22023';
  END IF;
END $verify$;

COMMENT ON VIEW public.triage_src_quality_city IS
  'Inbox source for city Truth-Engine reviews. Reads entity_review_queue '
  '(entity_type=''city''); NEVER city_review_queue_legacy — see 20260905100000.';
COMMENT ON VIEW public.triage_src_quality_venue IS
  'Inbox source for venue Truth-Engine reviews. Reads entity_review_queue '
  '(entity_type=''venue''); NEVER venue_review_queue_legacy — see 20260905100000.';
COMMENT ON VIEW public.triage_src_quality_village IS
  'Inbox source for village Truth-Engine reviews. Reads entity_review_queue '
  '(entity_type=''village''); NEVER village_review_queue_legacy — see 20260905100000.';
COMMENT ON VIEW public.triage_src_quality_marketplace IS
  'Inbox source for marketplace Truth-Engine reviews. Reads entity_review_queue '
  '(entity_type=''marketplace''); NEVER marketplace_review_queue_legacy — see 20260905100000.';
