-- Approve / reject RPCs for the city_review_queue safety gate.
-- Approval is the ONLY path by which lgbt_friendly_rating / safety_notes /
-- editorial_hook land on cities (source='llm+human'). Atomic + audited + admin-only.

CREATE OR REPLACE FUNCTION public.approve_city_review(p_id uuid, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r            public.city_review_queue%ROWTYPE;
  v_val        jsonb;
  v_rating     int;
  v_text       text;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;

  SELECT * INTO r FROM public.city_review_queue WHERE id = p_id AND status = 'open' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'review item not found or not open' USING ERRCODE='22023'; END IF;

  v_val := r.proposed_value;

  IF r.field = 'lgbt_friendly_rating' THEN
    v_rating := greatest(1, least(5, round((v_val->>'value')::numeric)::int));
    UPDATE public.cities SET lgbt_friendly_rating = v_rating WHERE id = r.city_id;
  ELSIF r.field = 'safety_notes' THEN
    v_text := v_val->>'value';
    UPDATE public.cities SET safety_notes = v_text WHERE id = r.city_id;
  ELSIF r.field = 'editorial_hook' THEN
    v_text := left(coalesce(v_val->>'value',''), 120);
    UPDATE public.cities SET editorial_hook = v_text WHERE id = r.city_id;
  ELSE
    RAISE EXCEPTION 'unsupported review field: %', r.field USING ERRCODE='22023';
  END IF;

  -- Stamp provenance source as llm+human.
  UPDATE public.cities
    SET field_provenance = jsonb_set(coalesce(field_provenance,'{}'::jsonb), ARRAY[r.field],
          jsonb_build_object('value', v_val->'value', 'source','llm+human',
                             'confidence', r.confidence, 'approved_at', now()), true)
    WHERE id = r.city_id;

  UPDATE public.city_review_queue
    SET status='approved', reviewer_id=auth.uid(), reviewed_at=now(), reviewer_note=p_note
    WHERE id = p_id;

  INSERT INTO public.city_consensus_audit (city_id, field, winning_value, winning_source, confidence, action, details)
  VALUES (r.city_id, r.field, v_val, 'llm+human', r.confidence, 'auto_commit',
          jsonb_build_object('approved_by', auth.uid(), 'citations', r.citations));

  -- Clear needs_attention if no other open reviews remain.
  IF NOT EXISTS (SELECT 1 FROM public.city_review_queue WHERE city_id=r.city_id AND status='open') THEN
    UPDATE public.cities SET needs_attention=false WHERE id=r.city_id;
  END IF;

  RETURN jsonb_build_object('approved', true, 'field', r.field, 'city_id', r.city_id);
END; $$;
ALTER FUNCTION public.approve_city_review(uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.approve_city_review(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_city_review(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reject_city_review(p_id uuid, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.city_review_queue%ROWTYPE;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  SELECT * INTO r FROM public.city_review_queue WHERE id = p_id AND status = 'open' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'review item not found or not open' USING ERRCODE='22023'; END IF;

  UPDATE public.city_review_queue
    SET status='rejected', reviewer_id=auth.uid(), reviewed_at=now(), reviewer_note=p_note
    WHERE id = p_id;

  INSERT INTO public.city_consensus_audit (city_id, field, winning_value, winning_source, confidence, action, details)
  VALUES (r.city_id, r.field, r.proposed_value, 'llm', r.confidence, 'no_change',
          jsonb_build_object('rejected_by', auth.uid(), 'note', p_note));

  IF NOT EXISTS (SELECT 1 FROM public.city_review_queue WHERE city_id=r.city_id AND status='open') THEN
    UPDATE public.cities SET needs_attention=false WHERE id=r.city_id;
  END IF;

  RETURN jsonb_build_object('rejected', true, 'field', r.field, 'city_id', r.city_id);
END; $$;
ALTER FUNCTION public.reject_city_review(uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reject_city_review(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_city_review(uuid, text) TO authenticated, service_role;
