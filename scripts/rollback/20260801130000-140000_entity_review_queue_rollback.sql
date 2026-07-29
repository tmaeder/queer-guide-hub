-- ============================================================================
-- ROLLBACK for 20260801130000_entity_review_queue.sql
--             + 20260801140000_approve_entity_review.sql
--
-- Run this in one transaction to put the review layer back exactly as it was
-- before B1/B2. The function bodies below were dumped from pg_proc.prosrc on
-- the LIVE database immediately before the migration, so they are the real
-- pre-migration definitions — NOT the (drifted) versions in the migration
-- history. Do not regenerate them from git.
--
-- Order matters: restore the tables first, because the old function bodies
-- declare `public.<x>_review_queue%ROWTYPE`.
-- ============================================================================

BEGIN;

-- ── 1. Put the five tables back ─────────────────────────────────────────────
DROP VIEW IF EXISTS public.city_review_queue;
DROP VIEW IF EXISTS public.venue_review_queue;
DROP VIEW IF EXISTS public.village_review_queue;
DROP VIEW IF EXISTS public.personality_review_queue;
DROP VIEW IF EXISTS public.marketplace_review_queue;

ALTER TABLE public.city_review_queue_legacy        RENAME TO city_review_queue;
ALTER TABLE public.venue_review_queue_legacy       RENAME TO venue_review_queue;
ALTER TABLE public.village_review_queue_legacy     RENAME TO village_review_queue;
ALTER TABLE public.personality_review_queue_legacy RENAME TO personality_review_queue;
ALTER TABLE public.marketplace_review_queue_legacy RENAME TO marketplace_review_queue;

-- Any rows created THROUGH the views after the migration live only in
-- entity_review_queue. Copy them back before dropping it.
INSERT INTO public.city_review_queue
  (id, city_id, field, proposed_value, citations, confidence, model, status,
   reviewer_id, reviewer_note, created_at, reviewed_at)
SELECT id, entity_id, field, proposed_value, citations, confidence, model, status,
       reviewer_id, reviewer_note, created_at, reviewed_at
  FROM public.entity_review_queue WHERE entity_type = 'city'
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.venue_review_queue
  (id, venue_id, field, proposed_value, citations, confidence, model, status,
   reviewer_id, reviewer_note, created_at, reviewed_at)
SELECT id, entity_id, field, proposed_value, citations, confidence, model, status,
       reviewer_id, reviewer_note, created_at, reviewed_at
  FROM public.entity_review_queue WHERE entity_type = 'venue'
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.village_review_queue
  (id, village_id, field, proposed_value, citations, confidence, model, status,
   reviewer_id, reviewer_note, created_at, reviewed_at)
SELECT id, entity_id, field, proposed_value, citations, confidence, model, status,
       reviewer_id, reviewer_note, created_at, reviewed_at
  FROM public.entity_review_queue WHERE entity_type = 'village'
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.personality_review_queue
  (id, personality_id, field, proposed_value, citations, confidence, model, status,
   reviewer_id, reviewer_note, created_at, reviewed_at)
SELECT id, entity_id, field, proposed_value, citations, confidence, model, status,
       reviewer_id, reviewer_note, created_at, reviewed_at
  FROM public.entity_review_queue WHERE entity_type = 'personality'
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.marketplace_review_queue
  (id, listing_id, field, proposed_value, citations, confidence, model, status,
   reviewer_id, reviewer_note, created_at, reviewed_at)
SELECT id, entity_id, field, proposed_value, citations, confidence, model, status,
       reviewer_id, reviewer_note, created_at, reviewed_at
  FROM public.entity_review_queue WHERE entity_type = 'marketplace'
ON CONFLICT (id) DO NOTHING;

-- ── 2. Restore the original function bodies ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.approve_city_review(p_id uuid, p_note text DEFAULT NULL::text, p_confirm boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $qg$
DECLARE
  r        public.city_review_queue%ROWTYPE;
  v_val    jsonb;
  v_rating int;
  v_text   text;
  v_crim   boolean;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;

  SELECT * INTO r FROM public.city_review_queue WHERE id = p_id AND status = 'open' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'review item not found or not open' USING ERRCODE='22023'; END IF;

  IF r.field = 'safety_notes' THEN
    SELECT (co.lgbti_criminalization->>'legal')='false' INTO v_crim
    FROM public.cities c JOIN public.countries co ON co.id=c.country_id WHERE c.id=r.city_id;
    IF coalesce(v_crim,false) AND NOT p_confirm THEN
      RAISE EXCEPTION 'criminalizing destination: safety_notes approval requires explicit confirmation'
        USING ERRCODE='42501';
    END IF;
  END IF;

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
          jsonb_build_object('approved_by', auth.uid(), 'citations', r.citations, 'confirmed', p_confirm));

  IF NOT EXISTS (SELECT 1 FROM public.city_review_queue WHERE city_id=r.city_id AND status='open') THEN
    UPDATE public.cities SET needs_attention=false WHERE id=r.city_id;
  END IF;

  RETURN jsonb_build_object('approved', true, 'field', r.field, 'city_id', r.city_id);
END; $qg$;

CREATE OR REPLACE FUNCTION public.approve_venue_review(p_id uuid, p_note text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $qg$
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
END; $qg$;

CREATE OR REPLACE FUNCTION public.approve_village_review(p_id uuid, p_note text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $qg$
DECLARE r public.village_review_queue%ROWTYPE; v_val jsonb;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role]) THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  SELECT * INTO r FROM public.village_review_queue WHERE id=p_id AND status='open' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'review row not found or not open'; END IF;
  v_val := r.proposed_value->'value';

  IF r.field='notable_landmarks' THEN
    UPDATE public.queer_villages
      SET notable_landmarks = ARRAY(SELECT jsonb_array_elements_text(v_val)),
          last_refreshed_at = now(),
          field_provenance = field_provenance || jsonb_build_object(r.field,
            jsonb_build_object('source','llm+human','confidence',r.confidence,'citations',r.citations))
      WHERE id=r.village_id;
  ELSE
    UPDATE public.queer_villages
      SET history        = CASE WHEN r.field='history' THEN v_val#>>'{}' ELSE history END,
          description    = CASE WHEN r.field='description' THEN v_val#>>'{}' ELSE description END,
          editorial_hook = CASE WHEN r.field='editorial_hook' THEN v_val#>>'{}' ELSE editorial_hook END,
          last_refreshed_at = now(),
          field_provenance = field_provenance || jsonb_build_object(r.field,
            jsonb_build_object('source','llm+human','confidence',r.confidence,'citations',r.citations))
      WHERE id=r.village_id;
  END IF;

  UPDATE public.village_review_queue
    SET status='approved', reviewer_id=auth.uid(), reviewer_note=p_note, reviewed_at=now() WHERE id=p_id;
  RETURN jsonb_build_object('approved',true,'village_id',r.village_id,'field',r.field);
END; $qg$;

CREATE OR REPLACE FUNCTION public.approve_personality_review(p_id uuid, p_note text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $qg$
declare r public.personality_review_queue%rowtype;
begin
  if not has_any_role_jwt(array['admin'::app_role]) then raise exception 'unauthorized' using errcode='42501'; end if;
  select * into r from public.personality_review_queue where id=p_id and status='open' for update;
  if not found then raise exception 'review item not found or not open'; end if;

  if r.field = 'lgbti_connection' then
    update public.personalities set lgbti_connection=r.proposed_value->>'value',
      field_provenance=jsonb_set(coalesce(field_provenance,'{}'::jsonb),'{lgbti_connection}',
        jsonb_build_object('source','llm+human','confidence',r.confidence,'approved_at',now()),true),
      updated_at=now() where id=r.personality_id;
  elsif r.field = 'lgbti_details' then
    update public.personalities set lgbti_details=r.proposed_value->>'value',
      field_provenance=jsonb_set(coalesce(field_provenance,'{}'::jsonb),'{lgbti_details}',
        jsonb_build_object('source','llm+human','confidence',r.confidence,'approved_at',now()),true),
      updated_at=now() where id=r.personality_id;
  elsif r.field = 'verification_status' then
    update public.personalities set verification_status=r.proposed_value->>'value', updated_at=now()
      where id=r.personality_id;
  end if;

  update public.personality_review_queue
     set status='approved', reviewer_id=auth.uid(), reviewed_at=now(), reviewer_note=p_note where id=p_id;
  if not exists (select 1 from public.personality_review_queue where personality_id=r.personality_id and status='open') then
    update public.personalities set needs_attention=false where id=r.personality_id;
  end if;
  return jsonb_build_object('approved',true,'field',r.field,'personality_id',r.personality_id);
end; $qg$;

CREATE OR REPLACE FUNCTION public.approve_marketplace_review(p_id uuid, p_note text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $qg$
DECLARE r public.marketplace_review_queue%ROWTYPE; v_subcat text;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  SELECT * INTO r FROM public.marketplace_review_queue WHERE id=p_id AND status='open' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'review item not found or not open' USING ERRCODE='22023'; END IF;
  v_subcat := r.proposed_value->>'subcategory';
  IF v_subcat IS NULL OR btrim(v_subcat) = '' THEN
    RAISE EXCEPTION 'proposed subcategory missing' USING ERRCODE='22023'; END IF;
  UPDATE public.marketplace_listings SET subcategory = v_subcat WHERE id = r.listing_id;
  UPDATE public.marketplace_review_queue
    SET status='approved', reviewer_id=auth.uid(), reviewed_at=now(), reviewer_note=p_note WHERE id=p_id;
  RETURN jsonb_build_object('approved', true, 'listing_id', r.listing_id, 'subcategory', v_subcat);
END; $qg$;

CREATE OR REPLACE FUNCTION public.reject_city_review(p_id uuid, p_note text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $qg$
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
END; $qg$;

CREATE OR REPLACE FUNCTION public.reject_venue_review(p_id uuid, p_note text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $qg$
DECLARE r public.venue_review_queue%ROWTYPE;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  SELECT * INTO r FROM public.venue_review_queue WHERE id = p_id AND status = 'open' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'review item not found or not open' USING ERRCODE='22023'; END IF;
  UPDATE public.venue_review_queue
    SET status='rejected', reviewer_id=auth.uid(), reviewed_at=now(), reviewer_note=p_note
    WHERE id = p_id;
  INSERT INTO public.venue_consensus_audit (venue_id, field, winning_value, winning_source, confidence, action, details)
  VALUES (r.venue_id, r.field, r.proposed_value, 'llm', r.confidence, 'no_change',
          jsonb_build_object('rejected_by', auth.uid(), 'note', p_note));
  IF NOT EXISTS (SELECT 1 FROM public.venue_review_queue WHERE venue_id=r.venue_id AND status='open') THEN
    UPDATE public.venues SET needs_attention=false WHERE id=r.venue_id AND needs_attention;
  END IF;
  RETURN jsonb_build_object('rejected', true, 'field', r.field, 'venue_id', r.venue_id);
END; $qg$;

CREATE OR REPLACE FUNCTION public.reject_village_review(p_id uuid, p_note text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $qg$
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role]) THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  UPDATE public.village_review_queue
    SET status='rejected', reviewer_id=auth.uid(), reviewer_note=p_note, reviewed_at=now()
    WHERE id=p_id AND status='open';
  IF NOT FOUND THEN RAISE EXCEPTION 'review row not found or not open'; END IF;
  RETURN jsonb_build_object('rejected',true);
END; $qg$;

CREATE OR REPLACE FUNCTION public.reject_personality_review(p_id uuid, p_note text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $qg$
declare r public.personality_review_queue%rowtype;
begin
  if not has_any_role_jwt(array['admin'::app_role]) then raise exception 'unauthorized' using errcode='42501'; end if;
  select * into r from public.personality_review_queue where id=p_id and status='open' for update;
  if not found then raise exception 'review item not found or not open'; end if;
  update public.personality_review_queue
     set status='rejected', reviewer_id=auth.uid(), reviewed_at=now(), reviewer_note=p_note where id=p_id;
  if not exists (select 1 from public.personality_review_queue where personality_id=r.personality_id and status='open') then
    update public.personalities set needs_attention=false where id=r.personality_id;
  end if;
  return jsonb_build_object('rejected',true,'field',r.field,'personality_id',r.personality_id);
end; $qg$;

CREATE OR REPLACE FUNCTION public.reject_marketplace_review(p_id uuid, p_note text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $qg$
DECLARE r public.marketplace_review_queue%ROWTYPE;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  SELECT * INTO r FROM public.marketplace_review_queue WHERE id=p_id AND status='open' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'review item not found or not open' USING ERRCODE='22023'; END IF;
  UPDATE public.marketplace_review_queue
    SET status='rejected', reviewer_id=auth.uid(), reviewed_at=now(), reviewer_note=p_note WHERE id=p_id;
  RETURN jsonb_build_object('rejected', true, 'listing_id', r.listing_id);
END; $qg$;

-- ── 3. Drop the new layer ───────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.approve_entity_review_batch(text, numeric, integer);
DROP FUNCTION IF EXISTS public.approve_entity_review(uuid, text, boolean);
DROP FUNCTION IF EXISTS public.reject_entity_review(uuid, text);
DROP FUNCTION IF EXISTS public._review_clear_needs_attention(text, uuid);
DROP FUNCTION IF EXISTS public._review_write_audit(text, uuid, text, jsonb, numeric, text, text, jsonb);
DROP FUNCTION IF EXISTS public._review_write_provenance(text, uuid, text, jsonb, numeric, jsonb);
DROP FUNCTION IF EXISTS public._review_risk_blocked(text, text, uuid);
DROP FUNCTION IF EXISTS public._apply_review_value(public.review_field_registry, uuid, jsonb);

DROP TRIGGER IF EXISTS trg_erq_cascade ON public.cities;
DROP TRIGGER IF EXISTS trg_erq_cascade ON public.venues;
DROP TRIGGER IF EXISTS trg_erq_cascade ON public.queer_villages;
DROP TRIGGER IF EXISTS trg_erq_cascade ON public.personalities;
DROP TRIGGER IF EXISTS trg_erq_cascade ON public.marketplace_listings;
DROP FUNCTION IF EXISTS public.erq_cascade_delete();

DROP TABLE IF EXISTS public.entity_review_queue;
DROP FUNCTION IF EXISTS public.erq_validate_field();
DROP TABLE IF EXISTS public.review_field_registry;

COMMIT;
