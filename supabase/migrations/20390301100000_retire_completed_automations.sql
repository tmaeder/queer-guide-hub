-- ============================================================================
-- Label the two unmarked deliberately-off automations so §6b can hard-fail
-- ============================================================================
--
-- check-pipeline-health.mjs §6b hard-fails on the false-disable shape:
--
--     auto_paused in history  AND  consecutive_failures = 0
--                             AND  last_run_status = 'success'
--                             AND  enabled = false
--
-- because auto-pause is a one-way door whose own success branch erases the
-- evidence — a falsely-paused row ends up reading exactly like a deliberate
-- retirement. The rule is correct and caught a real 8th victim
-- (marketplace_taxonomy_backfill) when it shipped.
--
-- Its escape hatch is a `[RETIRED ...]` marker in the automation's own
-- description, which moves the row to the WARN path (still named on every run,
-- so retirement cannot quietly become invisible) and which §6b's own comment
-- requires to be "a migration-reviewed change". This is that change.
--
-- Measured on prod 2026-09-10, the rule flags six rows and NOT ONE is a false
-- disable. Three already carry a marker and are untouched here:
--
--   event_dedup_sweep          [RETIRED 20270822093614] — superseded by
--                              run_dedup_truth_sweep('event').
--   ev_fill_eventbrite         [RETIRED 2026-08-30] — the Eventbrite v3 search
--                              endpoint 404s with and without credentials.
--   tag_image_provenance_sync  [RETIRED 2026-08-28] — glossary photography was
--                              removed wholesale, unified_tags.image_url is
--                              null on every row, so the Commons provenance
--                              match can never fire again. (Its zero-backlog
--                              reading is NOT "caught up": the 568 Wikimedia
--                              rows in image_assets are not tag images.)
--
-- The remaining three are the ones actually hard-failing CI:
--
--   tag_relation_verify        Its description already explains itself
--                              ("DISABLED 2026-08-29: broader arm ~29% correct
--                              …") but not in the bracketed form the regex
--                              matches, so the sentinel cannot see it.
--   marketplace_catalog_prune  No marker at all. COMPLETE: 1,100+ runs
--                              reporting {archived:0, remaining:0}; the last
--                              run with work was 2026-08-23 and it ended on an
--                              explicit no_domain_allowlist skip. Its own
--                              description already says "Disable when
--                              remaining=0" — which is what happened.
--   marketplace_affiliate_backfill
--                              Carries `[COMPLETED 2026-07-04: 6.5k fake copies
--                              cleared, remaining=0]`, which is a correct and
--                              honest label that the regex simply does not
--                              match. Re-verified today: the fake affiliate_url
--                              copies are still at ZERO. Rather than stack a
--                              second banner on it, the companion change
--                              teaches §6b that `[COMPLETED` is also a
--                              legitimate reason to stay off — a finished
--                              backfill is not a false disable.
--
-- This migration changes DESCRIPTIONS ONLY. It enables nothing, disables
-- nothing, and schedules nothing.
-- ============================================================================

DO $$
DECLARE
  v_marks CONSTANT jsonb := jsonb_build_object(
    'tag_relation_verify',
      '[RETIRED 2026-08-29: the broader arm measured ~29% correct across 46 proposals (siblings asserted as parent/child, two backwards, HIV Transmission conflated with AIDS), every one at self-reported confidence 1.000. Nothing was ever published; the 46 rows stay as re-proposal tombstones. Re-enabling needs a fresh precision measurement on a new sample, never a tuned threshold.] ',
    'marketplace_catalog_prune',
      '[RETIRED 2026-09-10: work complete — 1,100+ runs reporting {archived:0, remaining:0}, last run with work 2026-08-23, then an explicit no_domain_allowlist skip. Re-arm by setting conditions.domains to an explicit merchant_domain array and re-enabling.] '
  );
  v_slug text;
  v_mark text;
  v_marked int;
  v_enabled int;
BEGIN
  FOR v_slug, v_mark IN SELECT * FROM jsonb_each_text(v_marks)
  LOOP
    -- Idempotent, and soft on the precondition: a row that already carries a
    -- marker (because a concurrent change added one, or this migration is being
    -- re-run) is left exactly as it is rather than having a second banner
    -- stacked onto it.
    UPDATE public.admin_automations
       SET description = v_mark || coalesce(description, '')
     WHERE slug = v_slug
       AND coalesce(description, '') !~* '\[(RETIRED|COMPLETED)';
  END LOOP;

  -- ---- Postconditions: hard on the state this migration exists to reach ----

  -- All six flagged rows must now carry a marker the (widened) regex accepts.
  SELECT count(*) INTO v_marked
    FROM public.admin_automations
   WHERE slug IN ('event_dedup_sweep','ev_fill_eventbrite','tag_image_provenance_sync',
                  'tag_relation_verify','marketplace_catalog_prune',
                  'marketplace_affiliate_backfill')
     AND coalesce(description, '') ~* '\[(RETIRED|COMPLETED)';
  IF v_marked <> 6 THEN
    RAISE EXCEPTION 'expected all 6 deliberately-off automations to carry a marker, found %', v_marked;
  END IF;

  -- Nothing may have been armed. A migration that labels retirements must never
  -- be the thing that turns one back on.
  SELECT count(*) INTO v_enabled
    FROM public.admin_automations
   WHERE slug IN ('event_dedup_sweep','ev_fill_eventbrite','tag_image_provenance_sync',
                  'tag_relation_verify','marketplace_catalog_prune',
                  'marketplace_affiliate_backfill')
     AND enabled;
  IF v_enabled <> 0 THEN
    RAISE EXCEPTION 'a retired automation is enabled — this migration must not arm anything (% row(s))', v_enabled;
  END IF;
END $$;
