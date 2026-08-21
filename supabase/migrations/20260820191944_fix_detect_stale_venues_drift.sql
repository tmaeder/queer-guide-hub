-- =============================================================================
-- Fix detect-stale-venues registry/cron drift + recompute needs_attention
-- =============================================================================
-- 20260806100000_revive_dead_scoring_crons.sql moved the staleness threshold
-- 60d -> 180d (60d flags 94% of venues, making needs_attention meaningless) and
-- scheduled cron.schedule('detect-stale-venues', ..., 'run_detect_stale_venues(180, 1500)').
-- That reschedule never took: both admin_automations.action.command AND the
-- live cron.job still read the pre-fix 'detect_stale_venues(60, false)' call
-- (verified live 2026-08-20). Since run_detect_stale_venues only ever SETS
-- needs_attention=true and never clears it, every night since has kept adding
-- more of the 60-day-stale (but not 180-day-stale) majority to the flag,
-- driving it to 99.5% of live venues -- useless for admin triage.
--
-- 1. Repoint the registry + live cron to the already-fixed 180-day function.
-- 2. One-time recompute: clear needs_attention on venues where the ONLY
--    reason it's set is the old 60-day rule that no longer applies, keeping
--    it set wherever any OTHER real signal still holds (genuine 180d
--    staleness, missing coords, broken link, closed, category-review,
--    nonvenue-candidate, or an open entity_review_queue row) -- i.e. every
--    condition a writer in this codebase is actually known to set the flag
--    for. Batched: trg_search_documents_venue fires unscoped on every UPDATE
--    (300-row events UPDATE measured 14.6s, mostly that trigger).
-- =============================================================================

UPDATE public.admin_automations
SET action = jsonb_set(action, '{command}', '"\n    SELECT public.run_detect_stale_venues(180, 1500);\n  "'::jsonb)
WHERE slug = 'detect_stale_venues';

SELECT cron.schedule(
  'detect-stale-venues', '30 4 * * *',
  $cmd$SET statement_timeout = '240s'; SELECT public.run_detect_stale_venues(180, 1500);$cmd$
);

CREATE OR REPLACE FUNCTION public.run_needs_attention_recompute(p_batch integer DEFAULT 500)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cleared int := 0;
BEGIN
  WITH candidates AS (
    SELECT v.id
    FROM public.venues v
    WHERE v.duplicate_of_id IS NULL
      AND v.needs_attention = true
      AND v.latitude IS NOT NULL
      AND v.longitude IS NOT NULL
      AND v.closed_at IS NULL
      AND coalesce(v.url_status, '') <> 'broken'
      AND coalesce(v.enrichment_status -> 'category_backfill' ->> 'status', '') <> 'review'
      AND NOT (coalesce(v.enrichment_status, '{}'::jsonb) ? 'nonvenue_candidate')
      AND NOT EXISTS (
        SELECT 1 FROM public.entity_review_queue erq
        WHERE erq.entity_type = 'venue' AND erq.entity_id = v.id AND erq.status = 'open'
      )
      AND coalesce((SELECT max(vs.last_seen_at) FROM public.venue_sources vs WHERE vs.venue_id = v.id), v.created_at)
          >= now() - interval '180 days'
    LIMIT greatest(p_batch, 0)
  )
  UPDATE public.venues v
  SET needs_attention = false
  FROM candidates c
  WHERE v.id = c.id;
  GET DIAGNOSTICS v_cleared = ROW_COUNT;

  RETURN jsonb_build_object('cleared', v_cleared);
END;
$$;

REVOKE ALL ON FUNCTION public.run_needs_attention_recompute(integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_needs_attention_recompute(integer) TO service_role;
