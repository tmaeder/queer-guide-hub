-- Make the refresh-loop priority debt-DOMINANT (companion to the connection work).
--
-- priority was `debt_score * ln(view_count+2)`. In this corpus view_count is
-- dominated by adult-content traffic and is ~0 for notable historical/cultural
-- figures, so the multiplier pushed well-populated high-traffic adult rows to the
-- top and starved the thin, high-debt icons (Larry Kramer, Dorothy Allison) — the
-- exact records a connection/enrichment pass should reach first. Switch to
-- `debt_score + ln(view_count+2)`: debt (0–100) drives the order, view_count is a
-- minor tiebreak.

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
  (d.debt_score + ln(COALESCE(p.view_count, 0) + 2))         AS priority,
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
  AND (p.enrichment_status->>'triage') IS DISTINCT FROM 'insufficient_data'
  AND (p.wikidata_qid IS NULL OR p.wikidata_qid NOT LIKE 'SKIP\_%');

COMMENT ON VIEW public.personality_data_health IS
  'Per-personality data-debt + staleness + priority for the refresh loop. priority = debt_score + ln(view_count+2) (debt-dominant). Excludes archived, triaged, SKIP_ rows.';

GRANT SELECT ON public.personality_data_health TO service_role;
