-- ============================================================================
-- Personality backfill (one-shot)
-- Runs after 20260415150000_personality_data_ops_foundation.sql.
-- 1. Compute quality_score for every existing personality.
-- 2. Flag likely duplicates (name_norm + birth_date OR name_norm ≥ 0.93)
--    into review_queue so admins can resolve without destroying data.
-- 3. Downgrade untrusted rows (visibility='public' with no lgbti_connection
--    AND quality_score < 60) to visibility='draft'.
-- ============================================================================

-- 1. Quality score backfill
UPDATE public.personalities p SET
  quality_score = LEAST(100, GREATEST(0,
    (CASE WHEN length(coalesce(p.name,'')) >= 2                 THEN  5 ELSE 0 END) +
    (CASE WHEN p.image_url          IS NOT NULL AND p.image_url <> '' THEN 15 ELSE 0 END) +
    (CASE WHEN coalesce(p.description, p.bio, '') <> ''               THEN 10 ELSE 0 END) +
    (CASE WHEN length(coalesce(p.description, p.bio, '')) > 80        THEN 10 ELSE 0 END) +
    (CASE WHEN p.lgbti_connection   IS NOT NULL AND p.lgbti_connection <> '' THEN 20 ELSE 0 END) +
    (CASE WHEN p.birth_date         IS NOT NULL                       THEN 10 ELSE 0 END) +
    (CASE WHEN p.profession         IS NOT NULL AND p.profession  <> '' THEN 10 ELSE 0 END) +
    (CASE WHEN p.nationality        IS NOT NULL AND p.nationality <> '' THEN 10 ELSE 0 END) +
    (CASE WHEN p.wikidata_qid       IS NOT NULL AND p.wikidata_qid <> '' THEN 15 ELSE 0 END) +
    (CASE WHEN jsonb_typeof(coalesce(p.fields,'[]'::jsonb)) = 'array' AND jsonb_array_length(coalesce(p.fields,'[]'::jsonb)) > 0 THEN 5 ELSE 0 END)
  ))::smallint,
  updated_at = now()
WHERE quality_score IS NULL OR quality_score = 0;

-- 2. Duplicate detection → review_queue
-- Strong signal: same birth_date AND name trigram ≥ 0.85, or trigram ≥ 0.93 alone.
WITH pairs AS (
  SELECT
    a.id AS a_id, a.name AS a_name, a.birth_date AS a_dob,
    b.id AS b_id, b.name AS b_name, b.birth_date AS b_dob,
    extensions.similarity(a.name_normalized, b.name_normalized) AS sim
  FROM public.personalities a
  JOIN public.personalities b
    ON a.id < b.id
   AND a.name_normalized <> ''
   AND b.name_normalized <> ''
   AND a.duplicate_of_id IS NULL
   AND b.duplicate_of_id IS NULL
   AND extensions.similarity(a.name_normalized, b.name_normalized) >= 0.85
   AND (
     (a.birth_date IS NOT NULL AND a.birth_date = b.birth_date)
     OR extensions.similarity(a.name_normalized, b.name_normalized) >= 0.93
   )
)
INSERT INTO public.review_queue (entity_type, entity_id, review_type, status, details)
SELECT
  'personality'::text,
  p.a_id,
  'backfill_duplicate_candidate'::text,
  'pending'::text,
  jsonb_build_object(
    'candidate_id',   p.b_id,
    'candidate_name', p.b_name,
    'sim',            p.sim,
    'dob_match',      (p.a_dob IS NOT NULL AND p.a_dob = p.b_dob),
    'action_hint',    CASE WHEN p.sim >= 0.97 THEN 'auto_merge_safe' ELSE 'human_review' END
  )
FROM pairs p
ON CONFLICT DO NOTHING;

-- 3. Demote unsafe public rows to draft
UPDATE public.personalities
SET visibility = 'draft',
    needs_attention = true,
    updated_at = now()
WHERE visibility = 'public'
  AND (lgbti_connection IS NULL OR lgbti_connection = '')
  AND coalesce(quality_score, 0) < 60;

-- 4. Register helper view for the admin /pipelines health tab
CREATE OR REPLACE VIEW public.personality_data_health AS
SELECT
  (SELECT count(*) FROM public.personalities)                                                AS total,
  (SELECT count(*) FROM public.personalities WHERE verification_status = 'verified')         AS verified,
  (SELECT count(*) FROM public.personalities WHERE verification_status = 'pending')          AS pending_verification,
  (SELECT count(*) FROM public.personalities WHERE visibility = 'public')                    AS public_rows,
  (SELECT count(*) FROM public.personalities WHERE visibility = 'draft')                     AS draft_rows,
  (SELECT count(*) FROM public.personalities WHERE duplicate_of_id IS NOT NULL)              AS known_duplicates,
  (SELECT count(*) FROM public.personalities WHERE needs_attention)                          AS needs_attention,
  (SELECT count(*) FROM public.personalities WHERE image_url IS NULL OR image_url = '')      AS missing_image,
  (SELECT count(*) FROM public.personalities WHERE description IS NULL OR description = '')  AS missing_description,
  (SELECT count(*) FROM public.personalities WHERE lgbti_connection IS NULL OR lgbti_connection = '') AS missing_lgbti,
  (SELECT count(*) FROM public.personalities WHERE wikidata_qid IS NULL OR wikidata_qid = '') AS missing_qid,
  (SELECT avg(quality_score)::int FROM public.personalities WHERE quality_score IS NOT NULL) AS avg_quality,
  (SELECT count(*) FROM public.review_queue WHERE entity_type = 'personality' AND status = 'pending') AS open_reviews;

GRANT SELECT ON public.personality_data_health TO authenticated, anon, service_role;

COMMENT ON VIEW public.personality_data_health IS
  'Live dashboard counters for /admin/pipelines personality health tab';
