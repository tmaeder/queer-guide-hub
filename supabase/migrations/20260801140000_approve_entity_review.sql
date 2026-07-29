-- ============================================================================
-- B2 — one approve/reject pair instead of six
--
-- The five approve RPCs share an identical 7-step skeleton (role check →
-- SELECT FOR UPDATE → not-found raise → apply → provenance → close row →
-- clear needs_attention) but diverge on SIX independent axes, with no two
-- alike. Transcribed from the LIVE pg_proc bodies, not the migration files:
--
--   entity      | provenance | audit table            | needs_attn | trims | confirm | stamps
--   ------------+------------+------------------------+------------+-------+---------+--------
--   city        | column     | city_consensus_audit   | unguarded  | no    | YES     | –
--   venue       | NONE       | venue_consensus_audit  | GUARDED    | yes   | no      | –
--   village     | column     | none                   | NO         | no    | no      | last_refreshed_at
--   personality | column     | none                   | unguarded  | no    | no      | updated_at
--   marketplace | NONE       | none                   | NO         | yes   | no      | –
--
-- So: the shared skeleton and the field-level transform go in the registry and
-- one generic function; the genuinely per-entity side effects stay as small,
-- named, readable helpers dispatched on entity_type. Encoding provenance
-- shape + audit columns + needs_attention guards as ~10 more registry columns
-- would have been SQL-as-data, harder to read than the functions it replaced.
--
-- Other landmines the live bodies revealed:
--   * marketplace reads proposed_value->>'subcategory', NOT ->>'value'.
--   * village writes `field_provenance || ...` with NO coalesce, so it assumes
--     the column is non-null; city uses jsonb_set WITH coalesce.
--   * city's provenance object includes a 'value' key; personality's does not;
--     village's includes 'citations' but no 'approved_at'.
--   * personality silently no-ops on an unknown field (no ELSE raise).
--   * village's reject doesn't even SELECT the row and returns {rejected:true}
--     with no field/id.
--   * every entity returns a DIFFERENT id key (city_id / venue_id / ...).
--
-- The legacy names survive as thin wrappers preserving those exact return
-- shapes, so triage_action — the sole consumer, verified against the live DB —
-- needs no change, and src/integrations/supabase/types.ts is untouched.
-- ============================================================================

-- ── 1. Field-level transform ────────────────────────────────────────────────
--
-- Injection posture: identifiers via %I, numerics cast to int BEFORE
-- interpolation, every value via USING. No user-supplied literal ever reaches
-- format(). Same discipline as admin_automation_run's ^run_[a-z0-9_]+$ gate.

CREATE OR REPLACE FUNCTION public._apply_review_value(
  p_reg public.review_field_registry,
  p_entity_id uuid,
  p_proposed jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_extra text := '';
  v_val   jsonb;
  v_text  text;
  c       text;
BEGIN
  -- Identifier-only extras, never literals — so never an injection vector.
  FOR c IN SELECT jsonb_array_elements_text(coalesce(p_reg.apply_args->'touch','[]'::jsonb))
  LOOP v_extra := v_extra || format(', %I = now()', c); END LOOP;
  FOR c IN SELECT jsonb_array_elements_text(coalesce(p_reg.apply_args->'set_true','[]'::jsonb))
  LOOP v_extra := v_extra || format(', %I = true', c); END LOOP;

  -- Arrays and geo read `->value` with a fallback to the whole document,
  -- mirroring approve_venue_review. Scalars read the registry's value_key.
  v_val  := p_proposed -> p_reg.value_key;
  v_text := p_proposed ->> p_reg.value_key;

  CASE p_reg.apply_mode

  WHEN 'text' THEN
    EXECUTE format('UPDATE public.%I SET %I = $1 %s WHERE id = $2',
                   p_reg.target_table, p_reg.target_column, v_extra)
      USING v_text, p_entity_id;

  WHEN 'text_required' THEN
    v_text := nullif(btrim(v_text), '');
    IF v_text IS NULL THEN
      RAISE EXCEPTION 'proposed_value.% is empty for field %', p_reg.value_key, p_reg.field
        USING ERRCODE = '22023';
    END IF;
    EXECUTE format('UPDATE public.%I SET %I = $1 %s WHERE id = $2',
                   p_reg.target_table, p_reg.target_column, v_extra)
      USING v_text, p_entity_id;

  WHEN 'text_truncated' THEN
    EXECUTE format('UPDATE public.%I SET %I = left($1, %s) %s WHERE id = $2',
                   p_reg.target_table, p_reg.target_column,
                   (p_reg.apply_args->>'max_len')::int, v_extra)
      USING coalesce(v_text, ''), p_entity_id;

  WHEN 'int_clamped' THEN
    EXECUTE format('UPDATE public.%I SET %I = greatest(%s, least(%s, round($1)::int)) %s WHERE id = $2',
                   p_reg.target_table, p_reg.target_column,
                   (p_reg.apply_args->>'min')::int, (p_reg.apply_args->>'max')::int, v_extra)
      USING v_text::numeric, p_entity_id;

  WHEN 'text_array_union' THEN
    -- Union into the existing array and sort, exactly like approve_venue_review.
    EXECUTE format(
      'UPDATE public.%I SET %I = ('
      '  SELECT array(SELECT DISTINCT unnest('
      '    coalesce(%I, ''{}''::text[]) ||'
      '    coalesce((SELECT array_agg(DISTINCT t.s) FROM jsonb_array_elements_text($1) t(s)), ''{}''::text[])'
      '  ) ORDER BY 1)) %s WHERE id = $2',
      p_reg.target_table, p_reg.target_column, p_reg.target_column, v_extra)
      USING coalesce(v_val, p_proposed), p_entity_id;

  WHEN 'jsonb_array_to_text_array' THEN
    EXECUTE format(
      'UPDATE public.%I SET %I = ARRAY(SELECT jsonb_array_elements_text($1)) %s WHERE id = $2',
      p_reg.target_table, p_reg.target_column, v_extra)
      USING coalesce(v_val, p_proposed), p_entity_id;

  WHEN 'geo_latlng' THEN
    -- Two columns from one payload, and only when BOTH are present.
    EXECUTE format(
      'UPDATE public.%I SET %I = ($1->>''lat'')::numeric, %I = ($1->>''lng'')::numeric %s '
      'WHERE id = $2 AND $1->>''lat'' IS NOT NULL AND $1->>''lng'' IS NOT NULL',
      p_reg.target_table,
      p_reg.apply_args->>'lat_col', p_reg.apply_args->>'lng_col', v_extra)
      USING coalesce(v_val, p_proposed), p_entity_id;

  END CASE;
END $$;

-- ── 2. Risk gate ────────────────────────────────────────────────────────────
--
-- DELIBERATELY WIDER than the code it replaces. approve_city_review inlined
-- `(lgbti_criminalization->>'legal')='false'`; location_is_high_risk() is
-- `legal='false' OR death_penalty='yes'` and is the repo's declared single
-- source of truth for this threshold (it also backs the RLS safety layer).
-- The gated set can only GROW, never shrink — asserted in the parity test.

CREATE OR REPLACE FUNCTION public._review_risk_blocked(
  p_entity_type text, p_field text, p_entity_id uuid
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_country uuid; v_city uuid; v_gate text;
BEGIN
  SELECT risk_gate INTO v_gate FROM public.review_field_registry
   WHERE entity_type = p_entity_type AND field = p_field;
  IF v_gate IS DISTINCT FROM 'criminalizing_destination' THEN RETURN false; END IF;

  IF p_entity_type = 'city' THEN
    SELECT country_id, id INTO v_country, v_city FROM public.cities WHERE id = p_entity_id;
  ELSIF p_entity_type = 'venue' THEN
    SELECT country_id, city_id INTO v_country, v_city FROM public.venues WHERE id = p_entity_id;
  ELSE
    RETURN false;
  END IF;

  RETURN public.location_is_high_risk(v_country, v_city);
END $$;

-- ── 3. Per-entity side effects ──────────────────────────────────────────────
-- Small, named, and readable. This is where the six-axis divergence lives.

CREATE OR REPLACE FUNCTION public._review_write_provenance(
  p_entity_type text, p_entity_id uuid, p_field text,
  p_proposed jsonb, p_confidence numeric, p_citations jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_entity_type = 'city' THEN
    -- includes the value; jsonb_set WITH coalesce guard
    UPDATE public.cities SET field_provenance = jsonb_set(
        coalesce(field_provenance, '{}'::jsonb), ARRAY[p_field],
        jsonb_build_object('value', p_proposed->'value', 'source', 'llm+human',
                           'confidence', p_confidence, 'approved_at', now()), true)
      WHERE id = p_entity_id;

  ELSIF p_entity_type = 'village' THEN
    -- carries citations, no approved_at; `||` with no coalesce, as in the original
    UPDATE public.queer_villages SET field_provenance = field_provenance ||
        jsonb_build_object(p_field, jsonb_build_object(
          'source', 'llm+human', 'confidence', p_confidence, 'citations', p_citations))
      WHERE id = p_entity_id;

  ELSIF p_entity_type = 'personality' THEN
    -- no value key; verification_status deliberately writes NO provenance
    IF p_field IN ('lgbti_connection','lgbti_details') THEN
      UPDATE public.personalities SET field_provenance = jsonb_set(
          coalesce(field_provenance, '{}'::jsonb), ARRAY[p_field],
          jsonb_build_object('source', 'llm+human',
                             'confidence', p_confidence, 'approved_at', now()), true)
        WHERE id = p_entity_id;
    END IF;

  -- venue and marketplace write no field_provenance at all.
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public._review_write_audit(
  p_entity_type text, p_entity_id uuid, p_field text, p_proposed jsonb,
  p_confidence numeric, p_action text, p_source text, p_details jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_entity_type = 'city' THEN
    INSERT INTO public.city_consensus_audit
      (city_id, field, winning_value, winning_source, confidence, action, details)
    VALUES (p_entity_id, p_field, p_proposed, p_source, p_confidence, p_action, p_details);

  ELSIF p_entity_type = 'venue' THEN
    -- venue's audit table carries an extra agreeing_sources column
    INSERT INTO public.venue_consensus_audit
      (venue_id, field, winning_value, winning_source, confidence, agreeing_sources, action, details)
    VALUES (p_entity_id, p_field, p_proposed, p_source, p_confidence,
            CASE WHEN p_action = 'auto_commit' THEN ARRAY['llm','human'] ELSE NULL END,
            p_action, p_details);

  -- village, personality and marketplace have no consensus-audit table.
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public._review_clear_needs_attention(
  p_entity_type text, p_entity_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  -- Only when nothing else is still open for this entity.
  IF EXISTS (SELECT 1 FROM public.entity_review_queue
              WHERE entity_type = p_entity_type AND entity_id = p_entity_id AND status = 'open') THEN
    RETURN;
  END IF;

  IF p_entity_type = 'city' THEN
    UPDATE public.cities SET needs_attention = false WHERE id = p_entity_id;
  ELSIF p_entity_type = 'venue' THEN
    -- guarded, unlike the others — preserves the original WHERE ... AND needs_attention
    UPDATE public.venues SET needs_attention = false WHERE id = p_entity_id AND needs_attention;
  ELSIF p_entity_type = 'personality' THEN
    UPDATE public.personalities SET needs_attention = false WHERE id = p_entity_id;
  -- village and marketplace never touched needs_attention.
  END IF;
END $$;

-- ── 4. The generic pair ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.approve_entity_review(
  p_id uuid, p_note text DEFAULT NULL, p_confirm boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r public.entity_review_queue%ROWTYPE; reg public.review_field_registry%ROWTYPE;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501'; END IF;

  SELECT * INTO r FROM public.entity_review_queue WHERE id = p_id AND status = 'open' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'review item not found or not open' USING ERRCODE = '22023'; END IF;

  SELECT * INTO reg FROM public.review_field_registry
   WHERE entity_type = r.entity_type AND field = r.field AND active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unsupported review field: %', r.field USING ERRCODE = '22023'; END IF;

  -- Outing-safety invariant. Never inferred — p_confirm is forwarded from
  -- triage_action, which already carries it.
  IF public._review_risk_blocked(r.entity_type, r.field, r.entity_id) AND NOT p_confirm THEN
    RAISE EXCEPTION 'high-risk destination: % approval requires explicit confirmation', r.field
      USING ERRCODE = '42501';
  END IF;

  PERFORM public._apply_review_value(reg, r.entity_id, r.proposed_value);
  PERFORM public._review_write_provenance(r.entity_type, r.entity_id, r.field,
                                          r.proposed_value, r.confidence, r.citations);

  UPDATE public.entity_review_queue
     SET status = 'approved', reviewer_id = auth.uid(), reviewed_at = now(), reviewer_note = p_note
   WHERE id = p_id;

  PERFORM public._review_write_audit(r.entity_type, r.entity_id, r.field, r.proposed_value,
            r.confidence, 'auto_commit', 'llm+human',
            jsonb_build_object('approved_by', auth.uid(), 'citations', r.citations,
                               'confirmed', p_confirm));

  PERFORM public._review_clear_needs_attention(r.entity_type, r.entity_id);

  RETURN jsonb_build_object('approved', true, 'field', r.field,
                            'entity_type', r.entity_type, 'entity_id', r.entity_id);
END $$;

CREATE OR REPLACE FUNCTION public.reject_entity_review(
  p_id uuid, p_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r public.entity_review_queue%ROWTYPE;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501'; END IF;

  SELECT * INTO r FROM public.entity_review_queue WHERE id = p_id AND status = 'open' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'review item not found or not open' USING ERRCODE = '22023'; END IF;

  UPDATE public.entity_review_queue
     SET status = 'rejected', reviewer_id = auth.uid(), reviewed_at = now(), reviewer_note = p_note
   WHERE id = p_id;

  PERFORM public._review_write_audit(r.entity_type, r.entity_id, r.field, r.proposed_value,
            r.confidence, 'no_change', 'llm',
            jsonb_build_object('rejected_by', auth.uid(), 'note', p_note));

  PERFORM public._review_clear_needs_attention(r.entity_type, r.entity_id);

  RETURN jsonb_build_object('rejected', true, 'field', r.field,
                            'entity_type', r.entity_type, 'entity_id', r.entity_id);
END $$;

-- Batch approval. The rfr_never_batch_high_risk CHECK guarantees this can
-- never reach a criminalizing safety note or an accessibility claim.
CREATE OR REPLACE FUNCTION public.approve_entity_review_batch(
  p_entity_type text, p_min_confidence numeric DEFAULT 0.95, p_limit int DEFAULT 100
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id uuid; v_n int := 0;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501'; END IF;

  FOR v_id IN
    SELECT q.id FROM public.entity_review_queue q
      JOIN public.review_field_registry reg
        ON reg.entity_type = q.entity_type AND reg.field = q.field
     WHERE q.entity_type = p_entity_type AND q.status = 'open'
       AND reg.batchable AND reg.active
       AND q.confidence >= p_min_confidence
     ORDER BY q.created_at LIMIT p_limit
  LOOP
    PERFORM public.approve_entity_review(v_id, 'batch auto-approve', false);
    v_n := v_n + 1;
  END LOOP;

  RETURN jsonb_build_object('approved', v_n, 'entity_type', p_entity_type);
END $$;

-- ── 5. Legacy wrappers ──────────────────────────────────────────────────────
--
-- Same names, same arg shapes, same RETURN key names as before, so
-- triage_action and the generated types.ts need no change at all.

CREATE OR REPLACE FUNCTION public.approve_city_review(
  p_id uuid, p_note text DEFAULT NULL, p_confirm boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v jsonb;
BEGIN
  v := public.approve_entity_review(p_id, p_note, p_confirm);
  RETURN jsonb_build_object('approved', true, 'field', v->>'field', 'city_id', v->>'entity_id');
END $$;

CREATE OR REPLACE FUNCTION public.approve_venue_review(p_id uuid, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v jsonb;
BEGIN
  v := public.approve_entity_review(p_id, p_note, false);
  RETURN jsonb_build_object('approved', true, 'field', v->>'field', 'venue_id', v->>'entity_id');
END $$;

CREATE OR REPLACE FUNCTION public.approve_village_review(p_id uuid, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v jsonb;
BEGIN
  v := public.approve_entity_review(p_id, p_note, false);
  RETURN jsonb_build_object('approved', true, 'village_id', v->>'entity_id', 'field', v->>'field');
END $$;

CREATE OR REPLACE FUNCTION public.approve_personality_review(p_id uuid, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v jsonb;
BEGIN
  v := public.approve_entity_review(p_id, p_note, false);
  RETURN jsonb_build_object('approved', true, 'field', v->>'field', 'personality_id', v->>'entity_id');
END $$;

CREATE OR REPLACE FUNCTION public.approve_marketplace_review(p_id uuid, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v jsonb; v_sub text;
BEGIN
  SELECT proposed_value->>'subcategory' INTO v_sub
    FROM public.entity_review_queue WHERE id = p_id;
  v := public.approve_entity_review(p_id, p_note, false);
  RETURN jsonb_build_object('approved', true, 'listing_id', v->>'entity_id', 'subcategory', v_sub);
END $$;

CREATE OR REPLACE FUNCTION public.reject_city_review(p_id uuid, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v jsonb;
BEGIN
  v := public.reject_entity_review(p_id, p_note);
  RETURN jsonb_build_object('rejected', true, 'field', v->>'field', 'city_id', v->>'entity_id');
END $$;

CREATE OR REPLACE FUNCTION public.reject_venue_review(p_id uuid, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v jsonb;
BEGIN
  v := public.reject_entity_review(p_id, p_note);
  RETURN jsonb_build_object('rejected', true, 'field', v->>'field', 'venue_id', v->>'entity_id');
END $$;

CREATE OR REPLACE FUNCTION public.reject_village_review(p_id uuid, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.reject_entity_review(p_id, p_note);
  -- original returned only {rejected:true}
  RETURN jsonb_build_object('rejected', true);
END $$;

CREATE OR REPLACE FUNCTION public.reject_personality_review(p_id uuid, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v jsonb;
BEGIN
  v := public.reject_entity_review(p_id, p_note);
  RETURN jsonb_build_object('rejected', true, 'field', v->>'field', 'personality_id', v->>'entity_id');
END $$;

CREATE OR REPLACE FUNCTION public.reject_marketplace_review(p_id uuid, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v jsonb;
BEGIN
  v := public.reject_entity_review(p_id, p_note);
  RETURN jsonb_build_object('rejected', true, 'listing_id', v->>'entity_id');
END $$;

-- ── 6. Grants ───────────────────────────────────────────────────────────────
-- SECURITY DEFINER + an internal has_any_role_jwt check is the repo's
-- self-gating pattern; the linter has previously revoked EXECUTE on functions
-- like these, so re-grant explicitly.

DO $g$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'approve_entity_review(uuid,text,boolean)', 'reject_entity_review(uuid,text)',
    'approve_entity_review_batch(text,numeric,integer)',
    'approve_city_review(uuid,text,boolean)', 'approve_venue_review(uuid,text)',
    'approve_village_review(uuid,text)', 'approve_personality_review(uuid,text)',
    'approve_marketplace_review(uuid,text)',
    'reject_city_review(uuid,text)', 'reject_venue_review(uuid,text)',
    'reject_village_review(uuid,text)', 'reject_personality_review(uuid,text)',
    'reject_marketplace_review(uuid,text)']
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', f);
  END LOOP;
END $g$;
