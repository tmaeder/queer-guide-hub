-- Previous registry command, production snapshot 2026-10-29. Test fixture only.
WITH cand AS (
    SELECT DISTINCT ON (s.target_record_id)
           s.target_record_id AS lid,
           s.classification_result AS c,
           s.disposition
      FROM public.ingestion_staging s
      JOIN public.marketplace_listings l ON l.id = s.target_record_id
     WHERE s.entity_type = 'marketplace'
       AND s.classification_result IS NOT NULL
       AND s.target_record_id IS NOT NULL
       AND l.lgbti_relevance_score IS NULL
     ORDER BY s.target_record_id, s.updated_at DESC
     LIMIT 200
  )
  UPDATE public.marketplace_listings l SET
    lgbti_relevance_score = nullif(cand.c->>'lgbti_relevance_score','')::numeric,
    sensitivity_flags     = coalesce(cand.c->'sensitivity_flags','[]'::jsonb),
    classified_at         = now(),
    status                = CASE WHEN cand.disposition = 'rejected' THEN 'inactive' ELSE l.status END,
    updated_at            = now()
  FROM cand
  WHERE l.id = cand.lid;
