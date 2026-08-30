-- Phase 2 — Legal corroboration, part C: reconcile the `equaldex-api` drift, and record
-- the reason that is actually TRUE.
--
-- WHAT 20260330600000 CLAIMED: "Equaldex API: disable — no public API exists (returns
-- 403/404)". MEASURED 2026-08-30, that is false on both counts:
--   https://www.equaldex.com/api                    -> HTTP 200
--   https://www.equaldex.com/api/region?regionid=us -> HTTP 401
-- A 401 means the API EXISTS and wants a key. Anyone re-reading the old reason would
-- reasonably conclude "the endpoint moved, let's find the new one" and re-enable this row.
-- That is presumably how it came to be enabled again, and the wrong reason is the part
-- that keeps inviting the mistake.
--
-- THE REAL BLOCKER IS THE LICENCE, AND IT CANNOT BE ENGINEERED AROUND.
-- Equaldex's API terms are free-for-non-commercial-use only:
--   * "may not sell the data, offer it to paying users, or display it in a paid app or
--     website"
--   * data must NOT be stored longer than 30 DAYS
--   * attribution required; may not replicate the Equaldex service
-- The 30-day storage cap is structurally incompatible with `countries` being the durable
-- store behind location_is_high_risk(), safety_gated and RLS on venues/events/orgs. We
-- cannot hold the values, so we cannot corroborate with them. Scraping the region pages
-- instead violates the same terms plus the anti-replication clause, so option (b) from the
-- roadmap is closed too, not merely fragile.
--
-- WHAT WAS ALSO MEASURED, and matters for anyone re-opening this:
--   * The row has not run since 2026-04-16 (last_run_at == updated_at, consecutive_failures=1).
--   * NO code path in this repo writes scrape_sources.is_enabled. All three write-backs in
--     `scrape-web-sources` (lines ~1288/1386/1426) set only last_run_at / last_error /
--     consecutive_failures / totals. So the scraper did not re-enable it.
--   * anon holds INSERT/UPDATE/DELETE on scrape_sources, but RLS is enabled and every
--     write policy is TO authenticated + has_role_jwt('admin'), so anon cannot have done it
--     either. (anon ALSO holds TRUNCATE here and on 463 other tables, which RLS does NOT
--     gate — tracked separately; there is no anon-reachable TRUNCATE executor today.)
-- The honest statement is therefore: the row's is_enabled has not been written by any
-- code path in this repo since creation, and the earlier migration's UPDATE did not take
-- effect. No mechanism is being invented here to explain it.
--
-- A SEPARATE ROBUSTNESS GAP, RECORDED NOT FIXED: `is_enabled=false` is not a hard kill
-- switch. `scrape-web-sources` drops the `.eq('is_enabled', true)` filter entirely when
-- invoked with an explicit `sourceSlug` or `sourceId`, so a disabled source can still be
-- run on demand. Disabling this row stops the scheduled sweep, not a targeted call.

UPDATE public.scrape_sources
SET is_enabled = false,
    last_error = 'Retired 2026-08-30: licence-incompatible, not a technical failure. '
              || 'Equaldex API terms forbid commercial display and any storage beyond 30 days, '
              || 'which cannot back countries.lgbti_criminalization / location_is_high_risk(). '
              || 'Do not re-enable without a commercial licence. See migration 20260830-equaldex.',
    scrape_config = coalesce(scrape_config, '{}'::jsonb) || jsonb_build_object(
      'retired', jsonb_build_object(
        'at',              now(),
        'reason',          'licence_incompatible',
        'measured_api',    'GET /api -> 200; GET /api/region?regionid=us -> 401 (key required)',
        'blocking_terms',  'non-commercial only; no storage beyond 30 days; no replication',
        'supersedes',      '20260330600000 reason "no public API exists (returns 403/404)" — measured false',
        'phase',           'open-data-integration.md Phase 2')),
    updated_at = now()
WHERE slug = 'equaldex-api';

-- The sibling row is a NEWS feed into news_articles and is healthy (ran 2026-08-30 03:45).
-- It is NOT a rights corroborator and its green status must never be read as one. Recorded
-- on the row itself so the distinction survives this document.
UPDATE public.scrape_sources
SET scrape_config = coalesce(scrape_config, '{}'::jsonb) || jsonb_build_object(
      'not_a_rights_corroborator',
      'Feeds news_articles only. Does NOT corroborate countries.lgbti_* columns. '
      || 'Its healthy status says nothing about legal-data coverage.')
WHERE slug = 'equaldex-timeline';

DO $$
DECLARE v_enabled boolean; v_reason text;
BEGIN
  SELECT is_enabled, scrape_config->'retired'->>'reason'
    INTO v_enabled, v_reason
    FROM public.scrape_sources WHERE slug = 'equaldex-api';
  IF v_enabled IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'equaldex-api still enabled after retirement UPDATE';
  END IF;
  IF v_reason IS DISTINCT FROM 'licence_incompatible' THEN
    RAISE EXCEPTION 'equaldex-api retirement reason not recorded, got %', v_reason;
  END IF;
END $$;
