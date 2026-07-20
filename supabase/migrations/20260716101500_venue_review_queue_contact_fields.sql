-- Venue review queue: accept contact/geo enrichment fields.
-- venue-contact-enrich and venue-osm-enrich (Phase 2) queue sub-threshold
-- email/phone/website/geo proposals, but the queue's field CHECK (from
-- 20260608110000) only allowed accessibility/amenity fields. Extend the CHECK
-- and teach approve_venue_review() to copy the new fields onto venues.
-- Idempotent; no CONCURRENTLY.

ALTER TABLE public.venue_review_queue
  DROP CONSTRAINT IF EXISTS venue_review_queue_field_check;
ALTER TABLE public.venue_review_queue
  ADD CONSTRAINT venue_review_queue_field_check CHECK (field IN
    ('accessibility_attributes','accessibility_notes','amenities',
     'email','phone','website','geo'));

CREATE OR REPLACE FUNCTION public.approve_venue_review(p_id uuid, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r        public.venue_review_queue%ROWTYPE;
  v_slugs  text[];
  v_text   text;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;

  SELECT * INTO r FROM public.venue_review_queue WHERE id = p_id AND status = 'open' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'review item not found or not open' USING ERRCODE='22023'; END IF;

  IF r.field IN ('accessibility_attributes','amenities') THEN
    -- proposed_value.value (or proposed_value itself) is an array of canonical slugs.
    SELECT array_agg(DISTINCT s) INTO v_slugs
    FROM jsonb_array_elements_text(coalesce(r.proposed_value->'value', r.proposed_value)) AS t(s);

    IF r.field = 'accessibility_attributes' THEN
      UPDATE public.venues
        SET accessibility_attributes =
          (SELECT array(SELECT DISTINCT unnest(coalesce(accessibility_attributes,'{}'::text[]) || coalesce(v_slugs,'{}'::text[])) ORDER BY 1))
        WHERE id = r.venue_id;
    ELSE
      UPDATE public.venues
        SET amenities =
          (SELECT array(SELECT DISTINCT unnest(coalesce(amenities,'{}'::text[]) || coalesce(v_slugs,'{}'::text[])) ORDER BY 1)),
            amenities_verified = true
        WHERE id = r.venue_id;
    END IF;
  ELSIF r.field = 'accessibility_notes' THEN
    v_text := r.proposed_value->>'value';
    UPDATE public.venues SET accessibility_notes = v_text WHERE id = r.venue_id;
  ELSIF r.field IN ('email','phone','website') THEN
    v_text := nullif(trim(r.proposed_value->>'value'), '');
    IF v_text IS NULL THEN
      RAISE EXCEPTION 'proposed_value.value is empty for field %', r.field USING ERRCODE='22023'; END IF;
    IF r.field = 'email' THEN
      UPDATE public.venues SET email = v_text WHERE id = r.venue_id;
    ELSIF r.field = 'phone' THEN
      UPDATE public.venues SET phone = v_text WHERE id = r.venue_id;
    ELSE
      UPDATE public.venues SET website = v_text WHERE id = r.venue_id;
    END IF;
  ELSIF r.field = 'geo' THEN
    -- proposed_value is {lat, lng, ...} (or nested under value).
    UPDATE public.venues SET
      latitude  = coalesce(r.proposed_value->'value'->>'lat', r.proposed_value->>'lat')::numeric,
      longitude = coalesce(r.proposed_value->'value'->>'lng', r.proposed_value->>'lng')::numeric
    WHERE id = r.venue_id
      AND coalesce(r.proposed_value->'value'->>'lat', r.proposed_value->>'lat') IS NOT NULL
      AND coalesce(r.proposed_value->'value'->>'lng', r.proposed_value->>'lng') IS NOT NULL;
  ELSE
    RAISE EXCEPTION 'unsupported review field: %', r.field USING ERRCODE='22023';
  END IF;

  UPDATE public.venue_review_queue
    SET status='approved', reviewer_id=auth.uid(), reviewed_at=now(), reviewer_note=p_note
    WHERE id = p_id;

  INSERT INTO public.venue_consensus_audit (venue_id, field, winning_value, winning_source, confidence, agreeing_sources, action, details)
  VALUES (r.venue_id, r.field, r.proposed_value, 'llm+human', r.confidence, ARRAY['llm','human'], 'auto_commit',
          jsonb_build_object('approved_by', auth.uid(), 'citations', r.citations));

  IF NOT EXISTS (SELECT 1 FROM public.venue_review_queue WHERE venue_id=r.venue_id AND status='open') THEN
    UPDATE public.venues SET needs_attention=false WHERE id=r.venue_id AND needs_attention;
  END IF;

  RETURN jsonb_build_object('approved', true, 'field', r.field, 'venue_id', r.venue_id);
END; $$;
ALTER FUNCTION public.approve_venue_review(uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.approve_venue_review(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_venue_review(uuid, text) TO authenticated, service_role;
