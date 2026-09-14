-- ============================================================================
-- "Priority" was sorting the LEAST decidable rows to the top of the queue
--
-- `get_unified_triage_queue`'s priority score has always carried this term:
--
--     + CASE WHEN confidence_score < 0.5 THEN 15
--            WHEN confidence_score < 0.7 THEN  8
--            ELSE 0 END
--
-- For the queues it was written for that is right. A staging row or an abuse
-- report the machine was unsure about is exactly what a human should see
-- first: the reviewer holds information the classifier did not — the page, the
-- reporter, the context.
--
-- For the Quality queue it is precisely backwards, and this is measurable
-- rather than aesthetic. A `quality-*` row is a field proposal whose evidence
-- is ALREADY on the row: the value, the citations, the model. A low confidence
-- there does not mean "a human knows more", it means the producer looked at
-- all the evidence that exists and could not resolve it — and neither can the
-- reviewer, from the same row.
--
-- The effect on prod, 2026-09-14. `quality-personality` carries the highest
-- `priority_weight` in the registry (40), and the adult-profile probe's review
-- tiers sit at confidence 0.40-0.60, so every one of them collects the +15 or
-- +8. Ranked by the current formula the top of the inbox is the seven
-- `display_name_mismatch` rows at 0.40 — the tier whose own producer comment
-- says the platform's display name does NOT match ours, i.e. the single least
-- resolvable class in the corpus — and behind them 1,728 more adult-link rows.
-- Meanwhile 749 venue accessibility proposals at 0.80-1.00 and 346
-- criminalizing-destination safety notes at 1.00 sort below all of it.
--
-- The queue has taken five human decisions in the last sixty days against
-- 3,997 open rows. A reviewer who opens it is shown, by design, the rows
-- they are least able to act on — and all three decisions recorded on
-- 2026-09-14 are in this adult-links cohort, i.e. someone is currently
-- working the hardest rows in the corpus because those are the rows the
-- sort puts in front of them.
--
-- VERIFIED ON PROD 2026-09-14 by scoring the live views both ways in a
-- rolled-back transaction. The old ordering's top five are, in order:
--
--   Sergeant Miles - social_links.pornhub      0.40
--   Ty Roderick    - social_links.pornhub      0.40
--   Gabe Bradshaw  - social_links.pornhub      0.40
--   Stevie         - social_links.xhamster     0.40
--   Michael Lucas  - social_links.pornhub      0.40
--
-- which is exactly what the inbox shows today. Under the signed term the same
-- 3,997 rows lead with three `lgbti_connection` proposals and then
-- accessibility_attributes at confidence 1.00 — work a reviewer can finish.
--
-- WHY A COLUMN AND NOT AN `IN ('quality-city', ...)` LIST. The five quality
-- keys are not the point; the property is. "Low confidence means a human can
-- add something" is true of some queues and false of others, and that is a
-- fact about the SOURCE, so it belongs in `triage_sources` next to
-- `priority_weight` and `sla_hours`. Hardcoding the five keys would mean the
-- next registered queue silently inherits whichever behaviour the author of
-- that CASE happened to assume — and this repo has the `search_reindex_drain`
-- sentinel hardcoded to one slug out of ~240 as the standing reminder of what
-- that costs.
--
-- The column is a MULTIPLIER over the existing term, not a replacement, so
-- every currently-registered queue keeps its exact present ordering at the
-- default of 1.0 and only the five quality rows move. -1.0 flips the sign:
-- an unresolvable row sorts DOWN rather than up. It is deliberately not 0.0
-- ("ignore confidence"), because a corroborated 1.00 proposal genuinely is
-- better work than an ambiguous 0.50 one and the ordering should say so.
-- ============================================================================

ALTER TABLE public.triage_sources
  ADD COLUMN IF NOT EXISTS low_confidence_weight numeric NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.triage_sources.low_confidence_weight IS
  'Multiplier applied to the low-confidence term of the priority score. '
  '1 = low confidence raises priority (a human knows more than the classifier: '
  'staging, moderation, submissions). -1 = low confidence lowers it (all the '
  'evidence is already on the row, so an unsure producer means an undecidable '
  'item: the quality queues). 0 would ignore confidence entirely.';

UPDATE public.triage_sources
   SET low_confidence_weight = -1
 WHERE queue_key IN ('quality-city','quality-venue','quality-village',
                     'quality-personality','quality-marketplace');

CREATE OR REPLACE FUNCTION public.get_unified_triage_queue(p_queue_types text[] DEFAULT NULL::text[], p_content_types text[] DEFAULT NULL::text[], p_search text DEFAULT NULL::text, p_sort text DEFAULT 'priority'::text, p_page integer DEFAULT 1, p_per_page integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_offset INT;
  v_result jsonb;
  v_search TEXT;
  v_union TEXT;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  v_offset := (p_page - 1) * p_per_page;
  v_search := CASE WHEN p_search IS NOT NULL AND p_search != ''
              THEN '%' || lower(p_search) || '%' ELSE NULL END;

  -- Union every active registered view. Views are trusted (created only via
  -- migrations; registry is not client-writable).
  SELECT string_agg(format('SELECT * FROM public.%I', view_name), ' UNION ALL ')
  INTO v_union
  FROM triage_sources
  WHERE active
    AND (p_queue_types IS NULL OR queue_key = ANY(p_queue_types));

  IF v_union IS NULL THEN
    RETURN jsonb_build_object('items', '[]'::jsonb, 'total', 0, 'page', p_page, 'per_page', p_per_page);
  END IF;

  EXECUTE format($q$
    WITH unified AS (%s),
    filtered AS (
      SELECT u.*, r.priority_weight, r.low_confidence_weight
      FROM unified u
      JOIN triage_sources r ON r.queue_key = u.queue_type AND r.active
      WHERE ($1 IS NULL OR u.queue_type = ANY($1))
        AND ($2 IS NULL OR u.content_type = ANY($2))
        AND ($3 IS NULL OR lower(u.title) LIKE $3 OR lower(u.subtitle) LIKE $3)
    ),
    counted AS (SELECT count(*) AS total FROM filtered),
    sorted AS (
      SELECT f.*
      FROM filtered f
      ORDER BY
        CASE WHEN $4 = 'priority' THEN
          (f.priority_weight
          + LEAST(EXTRACT(EPOCH FROM now() - f.created_at) / 86400.0, 20)
          -- Signed by the source. See triage_sources.low_confidence_weight:
          -- on a quality queue all the evidence is already on the row, so an
          -- unsure producer means an undecidable item and it sorts DOWN.
          + f.low_confidence_weight *
            CASE WHEN f.confidence_score IS NOT NULL AND f.confidence_score < 0.5 THEN 15
                 WHEN f.confidence_score IS NOT NULL AND f.confidence_score < 0.7 THEN 8
                 ELSE 0 END
          + CASE WHEN f.flag_type = 'DELETE_REQUEST' THEN 20
                 WHEN f.flag_type = 'CORRECTION' THEN 10
                 ELSE 0 END
          )
        ELSE 0 END DESC,
        CASE WHEN $4 = 'age' THEN f.created_at END ASC,
        CASE WHEN $4 = 'confidence' THEN coalesce(f.confidence_score, 0) END ASC,
        f.created_at DESC
      LIMIT $5 OFFSET $6
    )
    SELECT jsonb_build_object(
      'items', coalesce((SELECT jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'queue_type', s.queue_type,
          'content_type', s.content_type,
          'title', s.title,
          'subtitle', s.subtitle,
          'status', s.status,
          'confidence_score', s.confidence_score,
          'created_at', s.created_at,
          'source', s.source,
          'entity_id', s.entity_id,
          'entity_table', s.entity_table,
          'has_diff', s.has_diff,
          'reporter_id', s.reporter_id,
          'meta', s.meta,
          'risk_flags', s.risk_flags
        )
      ) FROM sorted s), '[]'::jsonb),
      'total', (SELECT total FROM counted),
      'page', %s,
      'per_page', %s
    )
  $q$, v_union, p_page, p_per_page)
  INTO v_result
  USING p_queue_types, p_content_types, v_search, p_sort, p_per_page, v_offset;

  RETURN v_result;
END;
$function$;

-- ── Postcondition ───────────────────────────────────────────────────────────
-- Both halves are asserted. A migration that added the column and forgot to
-- USE it would pass any "column exists" test while the ordering stayed
-- inverted, and a migration that used it but set no row to -1 would be a
-- no-op — so the count of flipped sources is checked too, and the default is
-- checked to prove the other queues were not disturbed.
DO $verify$
DECLARE
  -- Comment-stripped, for the reason 50200101100000 records: pg_get_functiondef
  -- returns the body WITH its comments, so a prose mention of the column would
  -- satisfy these two assertions while the actual term was gone — the vacuous
  -- pass that is the mirror of that migration's false abort.
  v_raw       text := pg_get_functiondef('public.get_unified_triage_queue(text[],text[],text,text,integer,integer)'::regprocedure);
  v_src       text := regexp_replace(v_raw, '--[^' || chr(10) || ']*', '', 'g');
  v_flipped   int;
  v_unchanged int;
BEGIN
  IF position('f.low_confidence_weight *' IN v_src) = 0 THEN
    RAISE EXCEPTION 'low_confidence_weight is not applied to the priority score';
  END IF;
  IF position('r.low_confidence_weight' IN v_src) = 0 THEN
    RAISE EXCEPTION 'low_confidence_weight is not projected from triage_sources';
  END IF;

  SELECT count(*) INTO v_flipped
    FROM public.triage_sources WHERE low_confidence_weight = -1;
  SELECT count(*) INTO v_unchanged
    FROM public.triage_sources WHERE low_confidence_weight = 1;

  IF v_flipped <> 5 THEN
    RAISE EXCEPTION 'expected the 5 quality sources to be flipped, found %', v_flipped;
  END IF;
  IF v_unchanged = 0 THEN
    RAISE EXCEPTION 'every source was flipped — the non-quality queues must keep the default';
  END IF;

  RAISE NOTICE 'priority: % sources now sort unresolvable rows down, % keep the old behaviour',
    v_flipped, v_unchanged;
END
$verify$;
