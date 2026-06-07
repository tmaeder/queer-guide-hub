-- Phase 2 follow-on: keep the refresh loop's budget on the valuable cohort.
--
-- personality_data_health feeds the personality-refresh scheduler by priority.
-- After Phase 1 soft-archived 2,857 unanchored adult rows (review_status=
-- 'archived'), those rows are still "stale + incomplete", and because
-- priority = debt_score × ln(view_count+2) and adult performers carry high
-- traffic, they were floating to the TOP of the queue — so the loop spent its
-- pass trying (and correctly failing) to reconcile archived stage-names instead
-- of enriching real icons.
--
-- Exclude archived rows from the health view. Everything else unchanged.

CREATE OR REPLACE VIEW public.personality_data_health AS
SELECT
  p.id,
  p.name,
  p.is_living,
  p.death_date,
  p.last_refreshed_at,
  p.view_count,
  p.quality_score,
  (p.wikidata_qid IS NULL)                                   AS wikidata_qid_missing,
  (p.image_url IS NULL)                                      AS image_missing,
  (p.description IS NULL OR length(p.description) <= 80)     AS description_missing,
  (p.birth_date IS NULL)                                     AS birth_date_missing,
  (p.profession IS NULL)                                     AS profession_missing,
  (p.nationality IS NULL)                                    AS nationality_missing,
  CASE
    WHEN p.is_living THEN 90
    WHEN p.death_date IS NOT NULL AND p.death_date >= (now()::date - 90) THEN 7
    ELSE 365
  END                                                        AS ttl_days,
  (p.last_refreshed_at IS NULL
    OR p.last_refreshed_at < now() - (
      CASE
        WHEN p.is_living THEN interval '90 days'
        WHEN p.death_date IS NOT NULL AND p.death_date >= (now()::date - 90) THEN interval '7 days'
        ELSE interval '365 days'
      END
    ))                                                       AS is_stale,
  d.debt_score,
  (d.debt_score * ln(COALESCE(p.view_count, 0) + 2))         AS priority
FROM public.personalities p
CROSS JOIN LATERAL (
  SELECT ( (CASE WHEN p.wikidata_qid IS NULL THEN 15 ELSE 0 END)
         + (CASE WHEN p.image_url IS NULL THEN 15 ELSE 0 END)
         + (CASE WHEN p.description IS NULL OR length(p.description) <= 80 THEN 20 ELSE 0 END)
         + (CASE WHEN p.birth_date IS NULL THEN 10 ELSE 0 END)
         + (CASE WHEN p.profession IS NULL THEN 10 ELSE 0 END)
         + (CASE WHEN p.nationality IS NULL THEN 10 ELSE 0 END)
         )::numeric AS debt_score
) d
WHERE COALESCE(p.visibility, 'public') <> 'private'
  AND p.duplicate_of_id IS NULL
  AND p.review_status IS DISTINCT FROM 'archived';

COMMENT ON VIEW public.personality_data_health IS
  'Per-personality data-debt + staleness + priority for the refresh loop. priority = debt_score × ln(view_count+2). Excludes archived rows. Consumed by personality-refresh edge function.';

GRANT SELECT ON public.personality_data_health TO service_role;
