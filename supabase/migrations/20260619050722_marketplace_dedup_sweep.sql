-- Idempotent nightly dedup sweep for marketplace_listings.
--
-- pipeline-deduplicate has no marketplace branch and commit_marketplace_staging_batch
-- dedups only on (source_type, source_entity_id), so the same product re-listed under
-- distinct source ids (e.g. ohmyfantasy "-NN"-suffixed product URLs) commits as fresh
-- active rows. A one-off cleanup on 2026-06-19 inactivated 1,160 such dupes; this sweep
-- keeps the catalog clean going forward.
--
-- Collapses exact dupes (same generated title_normalized + merchant_domain), keeping the
-- richest row (affiliate > verified link > quality_score > views > newest). Reversible:
-- losers get status='inactive', deprecated_at, and a sensitivity_flags marker
-- ([{"inactive_reason":"duplicate","dedup_survivor_id":...}]). Safe by design — touches
-- only marketplace_listings, never the ingestion path; per-night volume is just the new
-- dupes from the daily ingest.
CREATE OR REPLACE FUNCTION public.run_marketplace_dedup_sweep()
RETURNS integer
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_n integer;
BEGIN
  WITH ranked AS (
    SELECT id,
      row_number() OVER (PARTITION BY title_normalized, merchant_domain
        ORDER BY (affiliate_url IS NOT NULL) DESC,
                 (link_health IN ('ok','redirect')) DESC,
                 quality_score DESC NULLS LAST,
                 views_count DESC NULLS LAST,
                 created_at DESC) rn,
      first_value(id) OVER (PARTITION BY title_normalized, merchant_domain
        ORDER BY (affiliate_url IS NOT NULL) DESC,
                 (link_health IN ('ok','redirect')) DESC,
                 quality_score DESC NULLS LAST,
                 views_count DESC NULLS LAST,
                 created_at DESC) keep_id
    FROM public.marketplace_listings
    WHERE status = 'active'
      AND title_normalized IS NOT NULL AND title_normalized <> ''
      AND merchant_domain IS NOT NULL
  ),
  losers AS (SELECT id, keep_id FROM ranked WHERE rn > 1)
  UPDATE public.marketplace_listings m
  SET status = 'inactive',
      deprecated_at = now(),
      sensitivity_flags = coalesce(m.sensitivity_flags, '[]'::jsonb)
        || jsonb_build_object('inactive_reason','duplicate','dedup_survivor_id', l.keep_id::text)
  FROM losers l
  WHERE m.id = l.id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$function$;

-- Nightly at 06:00 UTC (after the 04:00 marketplace-ingestion + commit settle).
SELECT cron.schedule('marketplace_dedup_sweep', '0 6 * * *',
  $$SELECT public.run_marketplace_dedup_sweep();$$);
