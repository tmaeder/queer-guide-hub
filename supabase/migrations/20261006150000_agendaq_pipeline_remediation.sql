-- Repair and requeue the AgendaQ import without manufacturing source facts.

INSERT INTO public.pipeline_runs(
  id, pipeline_name, status, context, items_total, started_at, triggered_by
) VALUES (
  'a6e0da00-2026-1006-8000-000000000001'::uuid,
  'agendaq-remediation',
  'running',
  jsonb_build_object('source_name', 'agendaq', 'target_tables', ARRAY['venues','events']),
  20310,
  now(),
  'manual'
)
ON CONFLICT (id) DO UPDATE
SET status=CASE
      WHEN pipeline_runs.status='completed' THEN pipeline_runs.status
      ELSE 'running'
    END,
    updated_at=now();

-- AgendaQ's association/organization taxons map to the existing product
-- vocabulary's community_center category. Original taxons remain in metadata.
UPDATE public.ingestion_staging
SET normalized_data = jsonb_set(normalized_data, '{category}', '"community_center"', true),
    updated_at = now()
WHERE source_name = 'agendaq'
  AND target_table = 'venues'
  AND normalized_data->>'category' = 'organization';

-- An event with no authored location may inherit one only from a business
-- explicitly linked in the same AgendaQ payload.
WITH linked AS (
  SELECT DISTINCT ON (e.id)
    e.id,
    v.source_entity_id AS venue_slug,
    v.normalized_data->'location' AS location
  FROM public.ingestion_staging e
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(e.raw_data->'businesses', '[]'::jsonb))
    WITH ORDINALITY AS business(value, ordinality)
  JOIN public.ingestion_staging v
    ON v.source_name = 'agendaq'
   AND v.target_table = 'venues'
   AND v.source_entity_id = business.value->>'id'
  WHERE e.source_name = 'agendaq'
    AND e.target_table = 'events'
    AND coalesce(e.normalized_data->'location'->>'address', '') = ''
    AND coalesce(e.normalized_data->'location'->>'city', '') = ''
    AND e.normalized_data->'location'->>'lat' IS NULL
    AND (
      coalesce(v.normalized_data->'location'->>'address', '') <> ''
      OR coalesce(v.normalized_data->'location'->>'city', '') <> ''
      OR v.normalized_data->'location'->>'lat' IS NOT NULL
    )
  ORDER BY e.id, business.ordinality
)
UPDATE public.ingestion_staging e
SET normalized_data = jsonb_set(
      jsonb_set(e.normalized_data, '{location}', linked.location, true),
      '{metadata}',
      coalesce(e.normalized_data->'metadata', '{}'::jsonb)
        || jsonb_build_object(
          'location_source', 'linked_venue',
          'location_source_venue', linked.venue_slug,
          'quality_warnings',
            coalesce(e.normalized_data->'metadata'->'quality_warnings', '[]'::jsonb)
              - 'missing_location'
        ),
      true
    ),
    updated_at = now()
FROM linked
WHERE e.id = linked.id;

-- AgendaQ sometimes assigns an after-midnight closing time to the start date.
-- Only repair bounded inversions shorter than 24 hours.
UPDATE public.ingestion_staging
SET normalized_data = jsonb_set(
      normalized_data,
      '{end_date}',
      to_jsonb(to_char(
        ((normalized_data->>'end_date')::timestamptz + interval '1 day')
          AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS"Z"'
      )),
      true
    ),
    updated_at = now()
WHERE source_name = 'agendaq'
  AND target_table = 'events'
  AND nullif(normalized_data->>'start_date', '') IS NOT NULL
  AND nullif(normalized_data->>'end_date', '') IS NOT NULL
  AND (normalized_data->>'end_date')::timestamptz
        < (normalized_data->>'start_date')::timestamptz
  AND (normalized_data->>'start_date')::timestamptz
        - (normalized_data->>'end_date')::timestamptz < interval '24 hours';

-- The first production application of this remediation formatted UTC offsets
-- as "+00", which PostgreSQL accepts but JavaScript's Date parser does not.
-- Normalize those already-written values to an unambiguous ISO-8601 offset.
UPDATE public.ingestion_staging
SET normalized_data = jsonb_set(
      normalized_data,
      '{end_date}',
      to_jsonb((normalized_data->>'end_date') || ':00'),
      true
    ),
    updated_at = now()
WHERE source_name = 'agendaq'
  AND target_table = 'events'
  AND normalized_data->>'end_date' ~ '[+-][0-9]{2}$';

-- Requeue every non-terminal row that now satisfies the deterministic source
-- contract. A high warning threshold in the scoped drain handles non-fatal
-- quality warnings without silently bypassing hard validation.
UPDATE public.ingestion_staging
SET disposition = 'pending',
    ai_validation_status = 'pending',
    ai_validation_result = NULL,
    ai_confidence_score = 0,
    dedup_status = 'pending',
    dedup_match_id = NULL,
    dedup_match_table = NULL,
    dedup_match_score = NULL,
    review_status = 'auto',
    error_message = NULL,
    pipeline_run_id = 'a6e0da00-2026-1006-8000-000000000001'::uuid,
    updated_at = now()
WHERE source_name = 'agendaq'
  AND disposition NOT IN ('inserted', 'updated')
  AND (
    (
      target_table = 'venues'
      AND normalized_data->>'category' <> 'organization'
      AND (
        coalesce(normalized_data->'location'->>'address', '') <> ''
        OR coalesce(normalized_data->'location'->>'city', '') <> ''
        OR normalized_data->'location'->>'lat' IS NOT NULL
      )
    )
    OR
    (
      target_table = 'events'
      AND nullif(normalized_data->>'start_date', '') IS NOT NULL
      AND (
        coalesce(normalized_data->'location'->>'address', '') <> ''
        OR coalesce(normalized_data->'location'->>'city', '') <> ''
        OR normalized_data->'location'->>'lat' IS NOT NULL
      )
    )
  );

-- Genuinely unverifiable rows are preserved for a person to review. They are
-- deliberately excluded from the automated run and retain all source evidence.
UPDATE public.ingestion_staging
SET disposition = 'pending',
    ai_validation_status = 'needs_review',
    dedup_status = 'pending',
    review_status = 'pending_review',
    pipeline_run_id = NULL,
    error_message = NULL,
    updated_at = now()
WHERE source_name = 'agendaq'
  AND disposition NOT IN ('inserted', 'updated')
  AND (
    (
      target_table = 'venues'
      AND coalesce(normalized_data->'location'->>'address', '') = ''
      AND coalesce(normalized_data->'location'->>'city', '') = ''
      AND normalized_data->'location'->>'lat' IS NULL
    )
    OR
    (
      target_table = 'events'
      AND (
        nullif(normalized_data->>'start_date', '') IS NULL
        OR length(trim(coalesce(normalized_data->>'title', normalized_data->>'name', ''))) < 3
        OR (
          nullif(normalized_data->>'end_date', '') IS NOT NULL
          AND (normalized_data->>'end_date')::timestamptz
                < (normalized_data->>'start_date')::timestamptz
        )
        OR (
          coalesce(normalized_data->'location'->>'address', '') = ''
          AND coalesce(normalized_data->'location'->>'city', '') = ''
          AND normalized_data->'location'->>'lat' IS NULL
        )
      )
    )
  );

-- Make every source-evidence exception actionable in the human queue, while
-- closing transient dedup reviews whose staging rows have already advanced.
UPDATE public.review_queue q
SET status = 'resolved', resolved_at = coalesce(q.resolved_at, now())
FROM public.ingestion_staging s
WHERE q.entity_type = 'ingestion_staging'
  AND q.entity_id = s.id
  AND q.status = 'pending'
  AND q.review_type = 'merge_candidate'
  AND s.source_name = 'agendaq'
  AND (s.disposition IN ('inserted', 'updated') OR s.review_status = 'approved');

UPDATE public.review_queue q
SET status = 'resolved', resolved_at = coalesce(q.resolved_at, now())
FROM public.ingestion_staging s
WHERE q.entity_type = 'ingestion_staging'
  AND q.entity_id = s.id
  AND q.status = 'pending'
  AND q.review_type = 'validate_flag'
  AND s.source_name = 'agendaq'
  AND NOT (
    s.disposition = 'pending'
    AND s.ai_validation_status = 'needs_review'
  );

INSERT INTO public.review_queue(entity_type, entity_id, review_type, status, details)
SELECT
  'ingestion_staging',
  s.id,
  'validate_flag',
  'pending',
  jsonb_build_object(
    'errors', coalesce(s.ai_validation_result->'errors', '[]'::jsonb),
    'warnings', coalesce(s.ai_validation_result->'warnings', '[]'::jsonb),
    'target_table', s.target_table,
    'source_name', s.source_name,
    'reason', 'AgendaQ source evidence is insufficient for deterministic import'
  )
FROM public.ingestion_staging s
WHERE s.source_name = 'agendaq'
  AND s.ai_validation_status = 'needs_review'
  AND NOT EXISTS (
    SELECT 1
    FROM public.review_queue q
    WHERE q.entity_type = 'ingestion_staging'
      AND q.entity_id = s.id
      AND q.review_type = 'validate_flag'
      AND q.status = 'pending'
  );
