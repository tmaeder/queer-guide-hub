-- Follow-on to the personalities content-quality remediation
-- (docs/plans/2026-06-07-personalities-content-quality-design.md).
--
-- personality-refresh now derives a SOURCED lgbti_connection from Wikidata
-- P91/P21 for anchored people (upgrading the non-committal "unclear"). But the
-- refresh loop only targets rows with debt_score > 0, and debt_score did not
-- count a missing connection — so a fully-complete anchored person (qid + image +
-- desc + birth + profession + nationality) had debt 0 and was never revisited,
-- leaving its connection stuck at "unclear" forever.
--
-- Add the missing connection to the debt vector (weight 10) so any anchored row
-- without a real connection becomes eligible and the loop self-corrects.
-- connection_missing is appended LAST so CREATE OR REPLACE keeps column order.

CREATE OR REPLACE VIEW public.personality_data_health AS
SELECT
  p.id, p.name, p.is_living, p.death_date, p.last_refreshed_at, p.view_count, p.quality_score,
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
  (d.debt_score * ln(COALESCE(p.view_count, 0) + 2))         AS priority,
  (p.lgbti_connection IS NULL OR p.lgbti_connection IN ('unclear','none_known')) AS connection_missing
FROM public.personalities p
CROSS JOIN LATERAL (
  SELECT ( (CASE WHEN p.wikidata_qid IS NULL THEN 15 ELSE 0 END)
         + (CASE WHEN p.image_url IS NULL THEN 15 ELSE 0 END)
         + (CASE WHEN p.description IS NULL OR length(p.description) <= 80 THEN 20 ELSE 0 END)
         + (CASE WHEN p.birth_date IS NULL THEN 10 ELSE 0 END)
         + (CASE WHEN p.profession IS NULL THEN 10 ELSE 0 END)
         + (CASE WHEN p.nationality IS NULL THEN 10 ELSE 0 END)
         + (CASE WHEN p.lgbti_connection IS NULL OR p.lgbti_connection IN ('unclear','none_known') THEN 10 ELSE 0 END)
         )::numeric AS debt_score
) d
WHERE COALESCE(p.visibility, 'public') <> 'private'
  AND p.duplicate_of_id IS NULL
  AND p.review_status IS DISTINCT FROM 'archived'
  -- Bare-name rows triaged as un-enrichable are for human review, not the loop;
  -- excluding them stops ~4,400 fruitless high-debt rows from starving the queue.
  AND (p.enrichment_status->>'triage') IS DISTINCT FROM 'insufficient_data';

COMMENT ON VIEW public.personality_data_health IS
  'Per-personality data-debt + staleness + priority for the refresh loop. debt counts missing connection (weight 10). Excludes archived + insufficient_data-triaged. priority = debt_score × ln(view_count+2).';

GRANT SELECT ON public.personality_data_health TO service_role;
