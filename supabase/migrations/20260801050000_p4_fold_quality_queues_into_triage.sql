-- ============================================================================
-- Content-processing simplification P4.1 — fold the Truth-Engine review queues
-- into the triage_sources registry (the "A3" promised in 20260724150000)
-- ----------------------------------------------------------------------------
-- The five per-entity quality queues (city/venue/village/personality/
-- marketplace *_review_queue) + editorial_drafts become registered triage
-- sources: one view each, registry rows, triage_action dispatch to the
-- EXISTING approve_*/reject_* RPCs (kept verbatim — they carry the safety
-- invariants: criminalizing safety_notes need p_confirm, personality identity
-- fields stay consent-gated). get_admin_counts loses its hardcoded quality
-- block — counts come from the registry loop (new count_prefix column keeps
-- the emitted keys byte-identical: quality_city, quality_venue, …).
-- get_unified_triage_queue becomes registry-driven (dynamic union over
-- triage_sources.view_name) so future queues need no RPC edit.
-- Also: reject_editorial_draft() — editorial reject was a raw client UPDATE,
-- the only queue without a reject RPC.
-- Existence audit + group requests stay in a (smaller) static block — their
-- flag/revert semantics don't fit the approve/reject contract yet.
-- ============================================================================

-- ── 0. Registry gains a count_prefix (quality keys keep their historic names) ─
ALTER TABLE public.triage_sources
  ADD COLUMN IF NOT EXISTS count_prefix text NOT NULL DEFAULT 'review_';

-- ── 1. Views (canonical TriageItem shape) ────────────────────────────────────

CREATE OR REPLACE VIEW public.triage_src_quality_city AS
SELECT
  q.id,
  'quality-city'::text AS queue_type,
  'cities'::text AS content_type,
  coalesce(c.name, 'City') || ' — ' || q.field AS title,
  coalesce(q.model, 'engine') AS subtitle,
  q.status,
  q.confidence::numeric AS confidence_score,
  q.created_at,
  'city-truth-engine'::text AS source,
  q.city_id AS entity_id,
  'cities'::text AS entity_table,
  true AS has_diff,
  NULL::uuid AS reporter_id,
  jsonb_build_object(
    'field', q.field,
    'proposed_value', q.proposed_value,
    'citations', q.citations,
    'model', q.model
  ) AS meta,
  NULL::text AS flag_type,
  CASE WHEN q.field IN ('safety_notes', 'lgbt_friendly_rating')
       THEN jsonb_build_object('safety', true, 'confirm_may_be_required', true)
       ELSE '{}'::jsonb END AS risk_flags
FROM city_review_queue q
LEFT JOIN cities c ON c.id = q.city_id
WHERE q.status = 'open';

CREATE OR REPLACE VIEW public.triage_src_quality_venue AS
SELECT
  q.id,
  'quality-venue'::text AS queue_type,
  'venues'::text AS content_type,
  coalesce(v.name, 'Venue') || ' — ' || q.field AS title,
  coalesce(q.model, 'engine') AS subtitle,
  q.status,
  q.confidence::numeric AS confidence_score,
  q.created_at,
  'venue-truth-engine'::text AS source,
  q.venue_id AS entity_id,
  'venues'::text AS entity_table,
  true AS has_diff,
  NULL::uuid AS reporter_id,
  jsonb_build_object(
    'field', q.field,
    'proposed_value', q.proposed_value,
    'citations', q.citations,
    'model', q.model
  ) AS meta,
  NULL::text AS flag_type,
  CASE WHEN q.field = 'accessibility_attributes'
       THEN jsonb_build_object('accessibility', true)
       ELSE '{}'::jsonb END AS risk_flags
FROM venue_review_queue q
LEFT JOIN venues v ON v.id = q.venue_id
WHERE q.status = 'open';

CREATE OR REPLACE VIEW public.triage_src_quality_village AS
SELECT
  q.id,
  'quality-village'::text AS queue_type,
  'queer_villages'::text AS content_type,
  coalesce(vv.name, 'Village') || ' — ' || q.field AS title,
  coalesce(q.model, 'engine') AS subtitle,
  q.status,
  q.confidence::numeric AS confidence_score,
  q.created_at,
  'village-truth-engine'::text AS source,
  q.village_id AS entity_id,
  'queer_villages'::text AS entity_table,
  true AS has_diff,
  NULL::uuid AS reporter_id,
  jsonb_build_object(
    'field', q.field,
    'proposed_value', q.proposed_value,
    'citations', q.citations,
    'model', q.model
  ) AS meta,
  NULL::text AS flag_type,
  '{}'::jsonb AS risk_flags
FROM village_review_queue q
LEFT JOIN queer_villages vv ON vv.id = q.village_id
WHERE q.status = 'open';

CREATE OR REPLACE VIEW public.triage_src_quality_personality AS
SELECT
  q.id,
  'quality-personality'::text AS queue_type,
  'personalities'::text AS content_type,
  coalesce(p.name, 'Personality') || ' — ' || q.field AS title,
  coalesce(q.model, 'engine') AS subtitle,
  q.status,
  q.confidence::numeric AS confidence_score,
  q.created_at,
  'personality-truth-engine'::text AS source,
  q.personality_id AS entity_id,
  'personalities'::text AS entity_table,
  true AS has_diff,
  NULL::uuid AS reporter_id,
  jsonb_build_object(
    'field', q.field,
    'proposed_value', q.proposed_value,
    'citations', q.citations,
    'model', q.model
  ) AS meta,
  NULL::text AS flag_type,
  jsonb_build_object('identity', true) AS risk_flags
FROM personality_review_queue q
LEFT JOIN personalities p ON p.id = q.personality_id
WHERE q.status = 'open';

CREATE OR REPLACE VIEW public.triage_src_quality_marketplace AS
SELECT
  q.id,
  'quality-marketplace'::text AS queue_type,
  'marketplace_listings'::text AS content_type,
  coalesce(ml.title, 'Listing') || ' — ' || q.field AS title,
  coalesce(q.model, 'engine') AS subtitle,
  q.status,
  q.confidence::numeric AS confidence_score,
  q.created_at,
  'marketplace-engine'::text AS source,
  q.listing_id AS entity_id,
  'marketplace_listings'::text AS entity_table,
  true AS has_diff,
  NULL::uuid AS reporter_id,
  jsonb_build_object(
    'field', q.field,
    'proposed_value', q.proposed_value,
    'citations', q.citations,
    'model', q.model
  ) AS meta,
  NULL::text AS flag_type,
  '{}'::jsonb AS risk_flags
FROM marketplace_review_queue q
LEFT JOIN marketplace_listings ml ON ml.id = q.listing_id
WHERE q.status = 'open';

CREATE OR REPLACE VIEW public.triage_src_editorial AS
SELECT
  d.id,
  'editorial'::text AS queue_type,
  d.entity_type AS content_type,
  coalesce(left(d.draft_hook, 80), 'Editorial draft') AS title,
  d.entity_type AS subtitle,
  d.status,
  NULL::numeric AS confidence_score,
  d.generated_at AS created_at,
  coalesce(d.model, 'editorial')::text AS source,
  d.entity_id,
  d.entity_type AS entity_table,
  true AS has_diff,
  NULL::uuid AS reporter_id,
  jsonb_build_object(
    'draft_hook', d.draft_hook,
    'draft_long', left(d.draft_long, 2000),
    'model', d.model
  ) AS meta,
  NULL::text AS flag_type,
  '{}'::jsonb AS risk_flags
FROM editorial_drafts d
WHERE d.status = 'pending';

REVOKE ALL ON
  public.triage_src_quality_city, public.triage_src_quality_venue,
  public.triage_src_quality_village, public.triage_src_quality_personality,
  public.triage_src_quality_marketplace, public.triage_src_editorial
FROM anon, authenticated;

-- ── 2. reject_editorial_draft (approve had an RPC; reject was a raw UPDATE) ──
CREATE OR REPLACE FUNCTION public.reject_editorial_draft(p_draft_id uuid, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  UPDATE editorial_drafts
  SET status = 'rejected',
      reviewer_id = auth.uid(),
      reviewer_note = coalesce(p_note, reviewer_note),
      reviewed_at = now()
  WHERE id = p_draft_id AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'draft not found or not pending: %', p_draft_id USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('ok', true, 'id', p_draft_id);
END $$;

REVOKE ALL ON FUNCTION public.reject_editorial_draft(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_editorial_draft(uuid, text) TO authenticated, service_role;

-- ── 3. Registry rows ─────────────────────────────────────────────────────────
INSERT INTO public.triage_sources
  (queue_key, view_name, label, priority_weight, sla_hours, count_key, count_prefix, capabilities)
VALUES
  ('quality-city',        'triage_src_quality_city',        'City quality',        35, 168, 'quality_city',        '', '{"can_reopen": false, "confirm_gate": true}'),
  ('quality-venue',       'triage_src_quality_venue',       'Venue quality',       35, 168, 'quality_venue',       '', '{"can_reopen": false}'),
  ('quality-village',     'triage_src_quality_village',     'Village quality',     30, 168, 'quality_village',     '', '{"can_reopen": false}'),
  ('quality-personality', 'triage_src_quality_personality', 'Personality quality', 40, 168, 'quality_personality', '', '{"can_reopen": false, "confirm_gate": true}'),
  ('quality-marketplace', 'triage_src_quality_marketplace', 'Marketplace quality', 25, 168, 'quality_marketplace', '', '{"can_reopen": false}'),
  ('editorial',           'triage_src_editorial',           'Editorial drafts',    30, 168, 'quality_editorial',   '', '{"can_reopen": false}')
ON CONFLICT (queue_key) DO UPDATE SET
  view_name = EXCLUDED.view_name,
  label = EXCLUDED.label,
  priority_weight = EXCLUDED.priority_weight,
  sla_hours = EXCLUDED.sla_hours,
  count_key = EXCLUDED.count_key,
  count_prefix = EXCLUDED.count_prefix,
  capabilities = EXCLUDED.capabilities;

-- ── 4. get_unified_triage_queue — registry-driven union ──────────────────────
CREATE OR REPLACE FUNCTION public.get_unified_triage_queue(
  p_queue_types text[] DEFAULT NULL::text[],
  p_content_types text[] DEFAULT NULL::text[],
  p_search text DEFAULT NULL::text,
  p_sort text DEFAULT 'priority'::text,
  p_page integer DEFAULT 1,
  p_per_page integer DEFAULT 50
)
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
      SELECT u.*, r.priority_weight
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
          + CASE WHEN f.confidence_score IS NOT NULL AND f.confidence_score < 0.5 THEN 15
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

-- ── 5. get_admin_counts — registry loop with count_prefix; quality static
--       block reduced to the two non-folded counts ────────────────────────────
CREATE OR REPLACE FUNCTION public.get_admin_counts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  estimates jsonb;
  v_sla jsonb := '{}'::jsonb;
  v_cnt bigint;
  v_overdue bigint;
  r record;
  sla_feedback_h constant int := 48;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role,'moderator'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501';
  END IF;

  SELECT jsonb_object_agg(relname, reltuples::bigint)
  INTO estimates
  FROM pg_class
  WHERE relnamespace = 'public'::regnamespace
    AND relname = ANY (ARRAY[
      'venues','events','news_articles','personalities','cities','countries',
      'hotels','queer_villages','marketplace_listings','community_groups',
      'unified_tags','cms_pages','email_ingestions','workflow_runs',
      'scrape_sources','content_links','community_submissions','redirects'
    ]);

  result := coalesce(estimates, '{}'::jsonb);

  FOR r IN
    SELECT queue_key, view_name, count_key, count_prefix, sla_hours
    FROM triage_sources WHERE active ORDER BY queue_key
  LOOP
    EXECUTE format(
      'SELECT count(*), count(*) FILTER (WHERE created_at < now() - %L::interval) FROM public.%I',
      r.sla_hours || ' hours', r.view_name
    ) INTO v_cnt, v_overdue;
    result := result
      || jsonb_build_object(r.count_prefix || r.count_key, v_cnt)
      || jsonb_build_object(r.count_prefix || r.count_key || '_overdue', v_overdue);
    v_sla := v_sla || jsonb_build_object(r.count_key, r.sla_hours);
  END LOOP;

  result := result || jsonb_build_object(
    'review_feedback',
      (SELECT count(*) FROM community_submissions
        WHERE content_type='feedback' AND feedback_status IN ('new','under_review')),
    'review_feedback_overdue',
      (SELECT count(*) FROM community_submissions
        WHERE content_type='feedback' AND feedback_status IN ('new','under_review')
          AND submitted_at < now() - (sla_feedback_h || ' hours')::interval),
    'sla_hours', v_sla || jsonb_build_object('feedback', sla_feedback_h)
  );

  -- Not yet registry-folded: group requests (membership decision, not content
  -- review) and the existence audit (flag/revert semantics).
  result := result || jsonb_build_object(
    'review_group_requests',
      (SELECT count(*) FROM group_join_requests WHERE status='pending'),
    'quality_existence',
      (SELECT count(*) FROM entity_existence_audit
        WHERE action='flag' AND reverted_at IS NULL)
  );

  RETURN result;
END;
$function$;

-- ── 6. triage_action — dispatch to the kept per-entity RPCs ──────────────────
-- (Full function replaced; the nine original branches are verbatim from
-- 20260724150001. New branches call the existing approve_*/reject_* RPCs so
-- every safety invariant stays where it lives today. NOTE: the quality RPCs
-- self-gate on admin; moderators hitting them get a clean 42501.)

CREATE OR REPLACE FUNCTION public.triage_action(
  p_item_id uuid,
  p_queue_type text,
  p_action text,
  p_user_id uuid DEFAULT NULL::uuid,
  p_notes text DEFAULT NULL::text,
  p_canned_slug text DEFAULT NULL::text,
  p_notify boolean DEFAULT true,
  p_confirm boolean DEFAULT false,
  p_payload jsonb DEFAULT NULL::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_notes TEXT;
  v_result jsonb := '{"ok": true}'::jsonb;
  v_keep uuid;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  IF p_action NOT IN ('approve', 'reject', 'skip', 'flag', 'reopen') THEN
    RAISE EXCEPTION 'invalid action: %', p_action;
  END IF;

  v_notes := p_notes;
  IF p_canned_slug IS NOT NULL AND v_notes IS NULL THEN
    SELECT template INTO v_notes
    FROM canned_responses
    WHERE slug = p_canned_slug AND active = true;
  END IF;

  CASE p_queue_type
    WHEN 'staging' THEN
      IF p_action = 'approve' THEN
        UPDATE ingestion_staging
        SET review_status = 'approved',
            reviewed_by = p_user_id,
            reviewed_at = now(),
            review_notes = coalesce(v_notes, review_notes)
        WHERE id = p_item_id;
      ELSIF p_action = 'reject' THEN
        UPDATE ingestion_staging
        SET review_status = 'rejected',
            disposition = 'rejected',
            reviewed_by = p_user_id,
            reviewed_at = now(),
            review_notes = coalesce(v_notes, review_notes)
        WHERE id = p_item_id;
      ELSIF p_action = 'reopen' THEN
        UPDATE ingestion_staging
        SET review_status = 'pending_review',
            disposition = 'pending',
            reviewed_by = NULL,
            reviewed_at = NULL
        WHERE id = p_item_id;
      END IF;

    WHEN 'moderation' THEN
      IF p_action = 'approve' THEN
        UPDATE moderation_flags
        SET status = 'RESOLVED', resolved_by = p_user_id, resolved_at = now(),
            resolution_note = coalesce(v_notes, resolution_note), updated_at = now()
        WHERE id = p_item_id;
      ELSIF p_action = 'reject' THEN
        UPDATE moderation_flags
        SET status = 'REJECTED', resolved_by = p_user_id, resolved_at = now(),
            resolution_note = coalesce(v_notes, resolution_note), updated_at = now()
        WHERE id = p_item_id;
      ELSIF p_action = 'reopen' THEN
        UPDATE moderation_flags
        SET status = 'OPEN', resolved_by = NULL, resolved_at = NULL, updated_at = now()
        WHERE id = p_item_id;
      END IF;

    WHEN 'submissions' THEN
      IF p_action = 'approve' THEN
        UPDATE community_submissions
        SET status = 'approved', reviewed_by = p_user_id, reviewed_at = now(),
            reviewer_notes = coalesce(v_notes, reviewer_notes)
        WHERE id = p_item_id;
      ELSIF p_action = 'reject' THEN
        UPDATE community_submissions
        SET status = 'rejected', reviewed_by = p_user_id, reviewed_at = now(),
            reviewer_notes = coalesce(v_notes, reviewer_notes)
        WHERE id = p_item_id;
      ELSIF p_action = 'reopen' THEN
        UPDATE community_submissions
        SET status = 'pending', reviewed_by = NULL, reviewed_at = NULL
        WHERE id = p_item_id;
      END IF;

    WHEN 'automation' THEN
      IF p_action = 'approve' THEN
        UPDATE content_flags
        SET status = 'approved', reviewed_by = p_user_id, reviewed_at = now(),
            updated_at = now()
        WHERE id = p_item_id;
      ELSIF p_action = 'reject' THEN
        UPDATE content_flags
        SET status = 'rejected', reviewed_by = p_user_id, reviewed_at = now(),
            updated_at = now()
        WHERE id = p_item_id;
      ELSIF p_action = 'reopen' THEN
        UPDATE content_flags
        SET status = 'pending', reviewed_by = NULL, reviewed_at = NULL,
            updated_at = now()
        WHERE id = p_item_id;
      END IF;

    WHEN 'tags' THEN
      IF p_action = 'approve' THEN
        PERFORM approve_tag_suggestions(ARRAY[p_item_id], p_user_id);
      ELSIF p_action = 'reject' THEN
        UPDATE tag_suggestions
        SET status = 'rejected', reviewed_by = p_user_id, reviewed_at = now()
        WHERE id = p_item_id;
      ELSIF p_action = 'reopen' THEN
        RAISE EXCEPTION 'reopen not supported for tags (approving creates tags)'
          USING ERRCODE = '22023';
      END IF;

    WHEN 'duplicates' THEN
      IF p_action = 'approve' THEN
        UPDATE scraper_dedupe_decisions
        SET decision = 'merged', decided_by = 'admin'
        WHERE id = p_item_id;
      ELSIF p_action = 'reject' THEN
        UPDATE scraper_dedupe_decisions
        SET decision = 'not_duplicate', decided_by = 'admin'
        WHERE id = p_item_id;
      ELSIF p_action = 'reopen' THEN
        RAISE EXCEPTION 'reopen not supported for duplicates (approving merges entities)'
          USING ERRCODE = '22023';
      END IF;

    WHEN 'news-quality' THEN
      IF p_action = 'approve' THEN
        UPDATE news_articles
        SET quality_status = 'passed'
        WHERE id = p_item_id;
      ELSIF p_action = 'reject' THEN
        UPDATE news_articles
        SET quality_status = 'rejected'
        WHERE id = p_item_id;
      ELSIF p_action = 'reopen' THEN
        UPDATE news_articles
        SET quality_status = 'review'
        WHERE id = p_item_id;
      END IF;

    WHEN 'entity-links' THEN
      IF p_action = 'approve' THEN
        UPDATE entity_link_review
        SET status = 'approved', resolved_by = p_user_id, resolved_at = now()
        WHERE id = p_item_id;
      ELSIF p_action = 'reject' THEN
        UPDATE entity_link_review
        SET status = 'rejected', resolved_by = p_user_id, resolved_at = now()
        WHERE id = p_item_id;
      ELSIF p_action = 'reopen' THEN
        UPDATE entity_link_review
        SET status = 'pending', resolved_by = NULL, resolved_at = NULL
        WHERE id = p_item_id;
      END IF;

    WHEN 'content' THEN
      IF p_action = 'approve' THEN
        UPDATE cms_content_metadata
        SET workflow_state = 'published', published_at = now(), published_by = p_user_id
        WHERE id = p_item_id AND workflow_state = 'review';
      ELSIF p_action = 'reject' THEN
        UPDATE cms_content_metadata
        SET workflow_state = 'draft', editor_notes = coalesce(v_notes, editor_notes)
        WHERE id = p_item_id;
      ELSIF p_action = 'reopen' THEN
        UPDATE cms_content_metadata
        SET workflow_state = 'review', published_at = NULL, published_by = NULL
        WHERE id = p_item_id;
      END IF;

    -- ── Folded Truth-Engine queues: dispatch to the kept per-entity RPCs ──
    WHEN 'quality-city' THEN
      IF p_action = 'approve' THEN
        PERFORM approve_city_review(p_item_id, v_notes, p_confirm);
      ELSIF p_action = 'reject' THEN
        PERFORM reject_city_review(p_item_id, v_notes);
      END IF;

    WHEN 'quality-venue' THEN
      IF p_action = 'approve' THEN
        PERFORM approve_venue_review(p_item_id, v_notes);
      ELSIF p_action = 'reject' THEN
        PERFORM reject_venue_review(p_item_id, v_notes);
      END IF;

    WHEN 'quality-village' THEN
      IF p_action = 'approve' THEN
        PERFORM approve_village_review(p_item_id, v_notes);
      ELSIF p_action = 'reject' THEN
        PERFORM reject_village_review(p_item_id, v_notes);
      END IF;

    WHEN 'quality-personality' THEN
      IF p_action = 'approve' THEN
        PERFORM approve_personality_review(p_item_id, v_notes);
      ELSIF p_action = 'reject' THEN
        PERFORM reject_personality_review(p_item_id, v_notes);
      END IF;

    WHEN 'quality-marketplace' THEN
      IF p_action = 'approve' THEN
        PERFORM approve_marketplace_review(p_item_id, v_notes);
      ELSIF p_action = 'reject' THEN
        PERFORM reject_marketplace_review(p_item_id, v_notes);
      END IF;

    WHEN 'editorial' THEN
      IF p_action = 'approve' THEN
        PERFORM approve_editorial_draft(p_item_id);
      ELSIF p_action = 'reject' THEN
        PERFORM reject_editorial_draft(p_item_id, v_notes);
      END IF;

    WHEN 'dedup-review' THEN
      IF p_action = 'approve' THEN
        v_keep := nullif(p_payload->>'keep_id', '')::uuid;
        PERFORM approve_dedup_review(p_item_id, v_keep);
      ELSIF p_action = 'reject' THEN
        PERFORM reject_dedup_review(p_item_id, v_notes);
      END IF;

    ELSE
      RAISE EXCEPTION 'unknown queue_type: %', p_queue_type;
  END CASE;

  v_result := jsonb_build_object(
    'ok', true,
    'action', p_action,
    'queue_type', p_queue_type,
    'item_id', p_item_id
  );

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.triage_action(uuid, text, text, uuid, text, text, boolean, boolean, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.triage_action(uuid, text, text, uuid, text, text, boolean, boolean, jsonb) TO authenticated, service_role;
