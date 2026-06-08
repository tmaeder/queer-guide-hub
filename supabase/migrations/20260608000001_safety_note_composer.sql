-- ============================================================================
-- Safety Notes — deterministic composer + tiered publishing + backfill
-- ============================================================================
-- Problem: cities.safety_notes had 0/3830 live (100 circular LLM proposals stuck
-- in city_review_queue); hotels.queer_safety_notes had 318 rows but only 18
-- distinct boilerplate strings. Two un-coordinated generators, no shared voice.
--
-- Fix: ONE pure SQL composer derives every safety note from structured facts
-- (country legal status + city LGBTQ+ density + hotel amenity signals). Safe,
-- high-equality, non-criminalizing destinations AUTO-PUBLISH (source='derived');
-- nuanced / moderate / criminalizing ones stay human-gated in city_review_queue.
--
-- OUTING-SAFETY INVARIANT: a criminalizing or death-penalty destination can NEVER
-- auto-publish. Enforced inside compose_safety_note() (sets auto_publishable=false
-- regardless of caller) AND at the approve_city_review() gate (explicit confirm).
--
-- NOTE: cities ARE in the search_documents sync (trg_search_documents_city, added
-- 20260531164347 — supersedes the stale "Cities are NOT in the search_documents
-- sync" comment in 20260607100000). City backfill is therefore hard-capped to
-- p_batch (≤300) per run to bound tsvector rebuild churn. Hotels have no such
-- trigger and are unconstrained.
-- ============================================================================

-- ===== 1. composer (pure, IMMUTABLE) ========================================
-- Input jsonb: { surface:'city'|'hotel'|'destination', country_name, equality_score,
--   criminalizing(bool), death_penalty(bool), penalty(text), unions_summary(text),
--   marriage(text 'Yes'/'No'), marriage_since(int), city_name,
--   density:{venues,events,villages}, hotel_signals:{gay_district,host_tips,venues_nearby,clothing_optional} }
-- Output jsonb: { note, risk_tier, confidence, auto_publishable, components[] }
CREATE OR REPLACE FUNCTION public.compose_safety_note(p jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_surface    text    := coalesce(p->>'surface','city');
  v_country    text    := nullif(p->>'country_name','');
  v_eq         int     := nullif(p->>'equality_score','')::int;
  v_crim       boolean := coalesce((p->>'criminalizing')::boolean, false);
  v_death      boolean := coalesce((p->>'death_penalty')::boolean, false);
  v_penalty    text    := nullif(p->>'penalty','');
  v_unions     text    := nullif(p->>'unions_summary','');
  v_marriage   boolean := lower(coalesce(p->>'marriage','')) = 'yes';
  v_marr_since int     := nullif(p->>'marriage_since','')::int;
  v_city       text    := nullif(p->>'city_name','');
  v_venues     int     := coalesce((p->'density'->>'venues')::int, 0);
  v_events     int     := coalesce((p->'density'->>'events')::int, 0);
  v_villages   int     := coalesce((p->'density'->>'villages')::int, 0);
  v_h_district boolean := coalesce((p->'hotel_signals'->>'gay_district')::boolean, false);
  v_h_tips     boolean := coalesce((p->'hotel_signals'->>'host_tips')::boolean, false);
  v_h_venues   boolean := coalesce((p->'hotel_signals'->>'venues_nearby')::boolean, false);
  v_h_clothing boolean := coalesce((p->'hotel_signals'->>'clothing_optional')::boolean, false);
  v_tier       text;
  v_conf       numeric := 0;
  v_auto       boolean := false;
  v_note       text;
  v_legal      text;
  v_dens       text;
  v_dens_inner text;
  v_guide      text;
  v_parts      text[] := '{}';
  v_comp       text[] := '{}';
  v_cdisp      text;
BEGIN
  -- country display name with article where conventional ("the United States")
  v_cdisp := CASE WHEN v_country IN ('United States','United Arab Emirates','United Kingdom',
      'Netherlands','Philippines','Bahamas','Maldives','Gambia','Czech Republic','Dominican Republic',
      'Central African Republic','Democratic Republic of the Congo','Republic of the Congo','Comoros')
    THEN 'the '||v_country ELSE v_country END;

  -- risk tier (mirrors src/hooks/useTripSafety.ts: death>crim>eq<40>low)
  v_tier := CASE
    WHEN v_death THEN 'critical'
    WHEN v_crim  THEN 'high'
    WHEN v_eq IS NOT NULL AND v_eq < 40 THEN 'moderate'
    ELSE 'low' END;

  -- confidence from legal-fact completeness only (NOT density, NOT LLM self-report)
  IF v_eq IS NOT NULL          THEN v_conf := v_conf + 0.5; END IF;
  IF (p ? 'criminalizing')     THEN v_conf := v_conf + 0.3; END IF;
  IF v_unions IS NOT NULL       THEN v_conf := v_conf + 0.2; END IF;
  v_conf := least(v_conf, 1.0);

  -- ---- hotel surface: compose from amenity signals (+ caution if criminalizing) ----
  IF v_surface = 'hotel' THEN
    IF v_crim THEN
      v_parts := array_append(v_parts, format('Note: same-sex activity is criminalized in %s; exercise discretion.',
                                   coalesce(v_cdisp,'this country')));
      v_comp := array_append(v_comp, 'legal_caution');
    END IF;
    IF v_h_district THEN v_parts := array_append(v_parts,'In the gay district.');            v_comp := array_append(v_comp,'gay_district'); END IF;
    IF v_h_tips     THEN v_parts := array_append(v_parts,'Host shares local LGBTQ+ tips.');   v_comp := array_append(v_comp,'host_tips'); END IF;
    IF v_h_venues   THEN v_parts := array_append(v_parts,'LGBTQ+ venues nearby.');            v_comp := array_append(v_comp,'venues_nearby'); END IF;
    IF v_h_clothing THEN v_parts := array_append(v_parts,'Clothing-optional friendly.');      v_comp := array_append(v_comp,'clothing_optional'); END IF;
    IF array_length(v_parts,1) IS NULL THEN
      v_parts := array_append(v_parts,'LGBTQ+-welcoming accommodation.');
      v_comp := array_append(v_comp,'fallback');
    END IF;
    RETURN jsonb_build_object('note', array_to_string(v_parts,' '), 'risk_tier', v_tier,
                              'confidence', v_conf, 'auto_publishable', false,
                              'components', to_jsonb(v_comp));
  END IF;

  -- ---- city / destination: legal layer (always) ----
  IF v_crim THEN
    IF v_death THEN
      v_legal := format('Same-sex activity is criminalized in %s and can carry the death penalty.',
                        coalesce(v_cdisp,'this country'));
    ELSE
      v_legal := format('Same-sex activity is criminalized in %s%s.', coalesce(v_cdisp,'this country'),
                        CASE WHEN v_penalty IS NOT NULL AND v_penalty <> 'No criminalisation'
                             THEN ' (penalty: '||v_penalty||')' ELSE '' END);
    END IF;
    v_comp := array_append(v_comp,'legal_criminalized');
  ELSE
    v_legal := format('Same-sex relationships are legal in %s', coalesce(v_cdisp,'this country'));
    IF v_marriage THEN
      v_legal := v_legal || CASE WHEN v_marr_since IS NOT NULL
                   THEN format(', and same-sex marriage has been recognized since %s', v_marr_since)
                   ELSE ', and same-sex marriage is recognized' END;
    ELSIF v_unions IS NOT NULL AND v_unions ILIKE '%union%' THEN
      v_legal := v_legal || ', and civil unions are recognized';
    END IF;
    v_legal := v_legal || '.';
    v_comp := array_append(v_comp,'legal_recognized');
  END IF;

  -- ---- city density layer (only when a real signal exists; never invented) ----
  IF v_city IS NOT NULL AND (v_venues > 0 OR v_villages > 0 OR v_events > 0) THEN
    v_parts := '{}';
    IF v_venues > 0 THEN
      v_parts := array_append(v_parts, (v_venues || ' LGBTQ+ ' || CASE WHEN v_venues=1 THEN 'venue' ELSE 'venues' END));
    END IF;
    IF v_villages > 0 THEN v_parts := array_append(v_parts,'a recognized queer district'); END IF;
    IF v_events   > 0 THEN v_parts := array_append(v_parts,'regular LGBTQ+ events'); END IF;
    v_dens_inner := array_to_string(v_parts, ', ');
    v_dens_inner := regexp_replace(v_dens_inner, ', ([^,]*)$', ' and \1');  -- Oxford-free "a, b and c"
    v_dens := format('%s has %s.', v_city, v_dens_inner);
    v_comp := array_append(v_comp,'city_density');
  END IF;

  -- ---- risk guidance sentence ----
  v_guide := CASE v_tier
    WHEN 'critical' THEN 'Exercise extreme caution: avoid public displays of affection and be aware of serious legal and personal-safety risks, including being outed.'
    WHEN 'high'     THEN 'Be discreet and aware of outing risks; same-sex activity is illegal here.'
    WHEN 'moderate' THEN 'Acceptance varies regionally; discretion is advised in some areas.'
    ELSE NULL END;
  IF v_guide IS NOT NULL THEN v_comp := array_append(v_comp,'guidance'); END IF;

  v_note := v_legal;
  IF v_dens  IS NOT NULL THEN v_note := v_note || ' ' || v_dens;  END IF;
  IF v_guide IS NOT NULL THEN v_note := v_note || ' ' || v_guide; END IF;

  -- tiered auto-publish predicate
  v_auto := (v_tier = 'low') AND (v_eq IS NOT NULL AND v_eq >= 75)
            AND NOT v_crim AND NOT v_death AND (v_conf >= 0.8);
  IF v_crim OR v_death THEN v_auto := false; END IF;  -- defense in depth (outing safety)

  RETURN jsonb_build_object('note', v_note, 'risk_tier', v_tier, 'confidence', v_conf,
                            'auto_publishable', v_auto, 'components', to_jsonb(v_comp));
END; $$;
ALTER FUNCTION public.compose_safety_note(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.compose_safety_note(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compose_safety_note(jsonb) TO authenticated, service_role;

-- ===== 2. city backfill (pure SQL, ≤p_batch/run for search-trigger safety) ===
CREATE OR REPLACE FUNCTION public.run_city_safety_backfill(p_batch int DEFAULT 300, p_force boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_automation_id uuid; v_run_id bigint; v_enabled boolean;
  v_started timestamptz := now();
  v_examined int := 0; v_published int := 0; v_queued int := 0;
  rec record; v_in jsonb; v_out jsonb;
BEGIN
  SELECT id, enabled INTO v_automation_id, v_enabled
  FROM public.admin_automations WHERE slug='city_safety_backfill';
  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  VALUES (v_automation_id,'city_safety_backfill',v_started,'success',0,0) RETURNING id INTO v_run_id;

  IF (v_enabled IS DISTINCT FROM true) AND NOT p_force THEN
    UPDATE public.admin_automation_runs SET finished_at=now(),
      summary=jsonb_build_object('skipped',true,'reason','paused') WHERE id=v_run_id;
    UPDATE public.admin_automations SET last_run_at=v_started, last_run_status='paused' WHERE id=v_automation_id;
    RETURN jsonb_build_object('skipped',true,'reason','paused');
  END IF;

  FOR rec IN
    SELECT c.id AS city_id, c.name AS city_name,
           co.name AS country_name, co.equality_score,
           (co.lgbti_criminalization->>'legal')='false'      AS criminalizing,
           (co.lgbti_criminalization->>'death_penalty')='Yes' AS death_penalty,
           co.lgbti_criminalization->>'penalty'              AS penalty,
           uu.u->>'summary'        AS unions_summary,
           uu.u->>'marriage'       AS marriage,
           uu.u->>'marriage_since' AS marriage_since,
           (SELECT count(*) FROM public.venues v          WHERE v.city_id=c.id) AS venues,
           (SELECT count(*) FROM public.events e          WHERE e.city_id=c.id) AS events,
           (SELECT count(*) FROM public.queer_villages q  WHERE q.city_id=c.id) AS villages
    FROM public.cities c
    JOIN public.countries co ON co.id=c.country_id
    LEFT JOIN LATERAL (SELECT CASE WHEN co.lgbti_same_sex_unions ~ '^\s*\{'
                                   THEN co.lgbti_same_sex_unions::jsonb ELSE '{}'::jsonb END AS u) uu ON true
    WHERE c.duplicate_of_id IS NULL
      AND (c.safety_notes IS NULL OR length(trim(c.safety_notes))=0)
      AND coalesce(c.field_provenance->'safety_notes'->>'source','') <> 'llm+human'
      AND NOT EXISTS (SELECT 1 FROM public.city_review_queue q
                      WHERE q.city_id=c.id AND q.field='safety_notes' AND q.status='open')
    ORDER BY (c.is_major_city IS TRUE) DESC, c.id
    LIMIT p_batch
  LOOP
    v_examined := v_examined + 1;
    v_in := jsonb_build_object(
      'surface','city','country_name',rec.country_name,'equality_score',rec.equality_score,
      'criminalizing',rec.criminalizing,'death_penalty',rec.death_penalty,'penalty',rec.penalty,
      'unions_summary',rec.unions_summary,'marriage',rec.marriage,'marriage_since',rec.marriage_since,
      'city_name',rec.city_name,
      'density', jsonb_build_object('venues',rec.venues,'events',rec.events,'villages',rec.villages));
    v_out := public.compose_safety_note(v_in);

    IF (v_out->>'auto_publishable')::boolean THEN
      UPDATE public.cities SET
        safety_notes = v_out->>'note',
        field_provenance = jsonb_set(coalesce(field_provenance,'{}'::jsonb), ARRAY['safety_notes'],
          jsonb_build_object('value', v_out->>'note', 'source','derived',
            'confidence',(v_out->>'confidence')::numeric, 'risk_tier',v_out->>'risk_tier',
            'approved_at', now()), true)
      WHERE id=rec.city_id;
      v_published := v_published + 1;
    ELSE
      INSERT INTO public.city_review_queue (city_id, field, proposed_value, citations, confidence, model, status)
      VALUES (rec.city_id,'safety_notes',
        jsonb_build_object('value',v_out->>'note',
          'rationale','Composed from country legal status + city LGBTQ+ density',
          'risk_tier',v_out->>'risk_tier'),
        '[]'::jsonb, (v_out->>'confidence')::numeric, 'composer:derived','open')
      ON CONFLICT (city_id, field) WHERE status='open'
      DO UPDATE SET proposed_value=EXCLUDED.proposed_value, confidence=EXCLUDED.confidence,
                    model=EXCLUDED.model, created_at=now();
      UPDATE public.cities SET needs_attention=true WHERE id=rec.city_id;
      v_queued := v_queued + 1;
    END IF;
  END LOOP;

  UPDATE public.admin_automation_runs SET finished_at=now(), items_examined=v_examined,
    items_changed=v_published+v_queued,
    summary=jsonb_build_object('examined',v_examined,'published',v_published,'queued',v_queued)
    WHERE id=v_run_id;
  UPDATE public.admin_automations SET last_run_at=v_started, last_run_status='success' WHERE id=v_automation_id;
  RETURN jsonb_build_object('examined',v_examined,'published',v_published,'queued',v_queued);
EXCEPTION WHEN OTHERS THEN
  UPDATE public.admin_automation_runs SET finished_at=now(), status='error', error=SQLERRM WHERE id=v_run_id;
  RAISE;
END; $$;
ALTER FUNCTION public.run_city_safety_backfill(int, boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.run_city_safety_backfill(int, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_city_safety_backfill(int, boolean) TO service_role, authenticated;

-- ===== 3. hotel backfill (regenerate boilerplate from amenity signals) =======
-- Leaves genuinely hand-edited notes untouched (only regenerates NULL / misterb&b
-- boilerplate / equality-score restatements). p_hotel_id scopes to one hotel.
CREATE OR REPLACE FUNCTION public.run_hotel_safety_backfill(p_batch int DEFAULT 500, p_hotel_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_automation_id uuid; v_run_id bigint; v_enabled boolean;
  v_started timestamptz := now(); v_examined int := 0; v_changed int := 0;
  rec record; v_in jsonb; v_out jsonb;
BEGIN
  SELECT id, enabled INTO v_automation_id, v_enabled
  FROM public.admin_automations WHERE slug='hotel_safety_backfill';
  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  VALUES (v_automation_id,'hotel_safety_backfill',v_started,'success',0,0) RETURNING id INTO v_run_id;

  -- single-hotel regenerate (admin "Regenerate from signals") bypasses pause
  IF p_hotel_id IS NULL AND (v_enabled IS DISTINCT FROM true) THEN
    UPDATE public.admin_automation_runs SET finished_at=now(),
      summary=jsonb_build_object('skipped',true,'reason','paused') WHERE id=v_run_id;
    UPDATE public.admin_automations SET last_run_at=v_started, last_run_status='paused' WHERE id=v_automation_id;
    RETURN jsonb_build_object('skipped',true,'reason','paused');
  END IF;

  FOR rec IN
    SELECT h.id, h.amenities, co.name AS country_name, co.equality_score,
           (co.lgbti_criminalization->>'legal')='false'      AS criminalizing,
           (co.lgbti_criminalization->>'death_penalty')='Yes' AS death_penalty,
           co.lgbti_criminalization->>'penalty'              AS penalty,
           uu.u->>'summary' AS unions_summary
    FROM public.hotels h
    JOIN public.countries co ON co.id=h.country_id
    LEFT JOIN LATERAL (SELECT CASE WHEN co.lgbti_same_sex_unions ~ '^\s*\{'
                                   THEN co.lgbti_same_sex_unions::jsonb ELSE '{}'::jsonb END AS u) uu ON true
    WHERE (p_hotel_id IS NOT NULL AND h.id=p_hotel_id)
       OR (p_hotel_id IS NULL AND (
             h.queer_safety_notes IS NULL
             OR h.queer_safety_notes ILIKE 'LGBTQ+-host accommodation listed on misterb&b%'
             OR h.queer_safety_notes ILIKE '%equality score%'))
    LIMIT p_batch
  LOOP
    v_examined := v_examined + 1;
    v_in := jsonb_build_object('surface','hotel','country_name',rec.country_name,
      'equality_score',rec.equality_score,'criminalizing',rec.criminalizing,
      'death_penalty',rec.death_penalty,'penalty',rec.penalty,'unions_summary',rec.unions_summary,
      'hotel_signals', jsonb_build_object(
        'gay_district',     'gay-district' = ANY(rec.amenities),
        'host_tips',        rec.amenities && ARRAY['host-shares-gay-local-tips','happy-to-share-local-tips'],
        'venues_nearby',    'lgbtq-venues-nearby' = ANY(rec.amenities),
        'clothing_optional', rec.amenities && ARRAY['clothing-optional-accepted','clothing-optional','nudism-allowed']));
    v_out := public.compose_safety_note(v_in);
    UPDATE public.hotels SET queer_safety_notes = v_out->>'note' WHERE id=rec.id;
    v_changed := v_changed + 1;
  END LOOP;

  UPDATE public.admin_automation_runs SET finished_at=now(), items_examined=v_examined,
    items_changed=v_changed, summary=jsonb_build_object('examined',v_examined,'changed',v_changed)
    WHERE id=v_run_id;
  UPDATE public.admin_automations SET last_run_at=v_started, last_run_status='success' WHERE id=v_automation_id;
  RETURN jsonb_build_object('examined',v_examined,'changed',v_changed);
EXCEPTION WHEN OTHERS THEN
  UPDATE public.admin_automation_runs SET finished_at=now(), status='error', error=SQLERRM WHERE id=v_run_id;
  RAISE;
END; $$;
ALTER FUNCTION public.run_hotel_safety_backfill(int, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.run_hotel_safety_backfill(int, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_hotel_safety_backfill(int, uuid) TO service_role, authenticated;

-- ===== 4. triage the stuck open city safety proposals ========================
-- Recompose each open safety_notes review from authoritative country data:
--  - safe tier  -> publish to cities (source='derived') + mark queue approved.
--  - otherwise  -> replace the circular proposed_value with the clean draft, keep open.
CREATE OR REPLACE FUNCTION public.triage_stuck_city_safety_reviews()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  rec record; v_in jsonb; v_out jsonb;
  v_examined int := 0; v_published int := 0; v_redrafted int := 0;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;

  FOR rec IN
    SELECT q.id AS review_id, q.confidence, c.id AS city_id, c.name AS city_name,
           co.name AS country_name, co.equality_score,
           (co.lgbti_criminalization->>'legal')='false'      AS criminalizing,
           (co.lgbti_criminalization->>'death_penalty')='Yes' AS death_penalty,
           co.lgbti_criminalization->>'penalty'              AS penalty,
           uu.u->>'summary' AS unions_summary, uu.u->>'marriage' AS marriage,
           uu.u->>'marriage_since' AS marriage_since,
           (SELECT count(*) FROM public.venues v         WHERE v.city_id=c.id) AS venues,
           (SELECT count(*) FROM public.events e         WHERE e.city_id=c.id) AS events,
           (SELECT count(*) FROM public.queer_villages g WHERE g.city_id=c.id) AS villages
    FROM public.city_review_queue q
    JOIN public.cities c    ON c.id=q.city_id
    JOIN public.countries co ON co.id=c.country_id
    LEFT JOIN LATERAL (SELECT CASE WHEN co.lgbti_same_sex_unions ~ '^\s*\{'
                                   THEN co.lgbti_same_sex_unions::jsonb ELSE '{}'::jsonb END AS u) uu ON true
    WHERE q.field='safety_notes' AND q.status='open'
  LOOP
    v_examined := v_examined + 1;
    v_in := jsonb_build_object('surface','city','country_name',rec.country_name,
      'equality_score',rec.equality_score,'criminalizing',rec.criminalizing,
      'death_penalty',rec.death_penalty,'penalty',rec.penalty,'unions_summary',rec.unions_summary,
      'marriage',rec.marriage,'marriage_since',rec.marriage_since,'city_name',rec.city_name,
      'density',jsonb_build_object('venues',rec.venues,'events',rec.events,'villages',rec.villages));
    v_out := public.compose_safety_note(v_in);

    IF (v_out->>'auto_publishable')::boolean THEN
      UPDATE public.cities SET
        safety_notes = v_out->>'note',
        field_provenance = jsonb_set(coalesce(field_provenance,'{}'::jsonb), ARRAY['safety_notes'],
          jsonb_build_object('value',v_out->>'note','source','derived',
            'confidence',(v_out->>'confidence')::numeric,'risk_tier',v_out->>'risk_tier','approved_at',now()), true)
      WHERE id=rec.city_id;
      UPDATE public.city_review_queue SET status='approved', reviewed_at=now(),
        reviewer_note='auto-approved by composer (safe tier)' WHERE id=rec.review_id;
      INSERT INTO public.city_consensus_audit (city_id, field, winning_value, winning_source, confidence, action, details)
      VALUES (rec.city_id,'safety_notes', jsonb_build_object('value',v_out->>'note'),'derived',
              (v_out->>'confidence')::numeric,'auto_commit', jsonb_build_object('via','triage_safe_tier'));
      IF NOT EXISTS (SELECT 1 FROM public.city_review_queue WHERE city_id=rec.city_id AND status='open' AND id<>rec.review_id) THEN
        UPDATE public.cities SET needs_attention=false WHERE id=rec.city_id;
      END IF;
      v_published := v_published + 1;
    ELSE
      UPDATE public.city_review_queue SET
        proposed_value = jsonb_build_object('value',v_out->>'note',
          'rationale','Composed from country legal status + city LGBTQ+ density','risk_tier',v_out->>'risk_tier'),
        confidence = (v_out->>'confidence')::numeric, model='composer:derived'
      WHERE id=rec.review_id;
      v_redrafted := v_redrafted + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('examined',v_examined,'published',v_published,'redrafted',v_redrafted);
END; $$;
ALTER FUNCTION public.triage_stuck_city_safety_reviews() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.triage_stuck_city_safety_reviews() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.triage_stuck_city_safety_reviews() TO authenticated, service_role;

-- ===== 5. admin batch-approve (safe-tier rows only) ==========================
CREATE OR REPLACE FUNCTION public.batch_approve_safe_city_reviews()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  rec record; v_in jsonb; v_out jsonb; v_approved int := 0;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;

  FOR rec IN
    SELECT q.id AS review_id, c.id AS city_id, c.name AS city_name,
           co.name AS country_name, co.equality_score,
           (co.lgbti_criminalization->>'legal')='false'      AS criminalizing,
           (co.lgbti_criminalization->>'death_penalty')='Yes' AS death_penalty,
           co.lgbti_criminalization->>'penalty'              AS penalty,
           uu.u->>'summary' AS unions_summary, uu.u->>'marriage' AS marriage,
           uu.u->>'marriage_since' AS marriage_since,
           (SELECT count(*) FROM public.venues v         WHERE v.city_id=c.id) AS venues,
           (SELECT count(*) FROM public.events e         WHERE e.city_id=c.id) AS events,
           (SELECT count(*) FROM public.queer_villages g WHERE g.city_id=c.id) AS villages
    FROM public.city_review_queue q
    JOIN public.cities c     ON c.id=q.city_id
    JOIN public.countries co ON co.id=c.country_id
    LEFT JOIN LATERAL (SELECT CASE WHEN co.lgbti_same_sex_unions ~ '^\s*\{'
                                   THEN co.lgbti_same_sex_unions::jsonb ELSE '{}'::jsonb END AS u) uu ON true
    WHERE q.field='safety_notes' AND q.status='open'
  LOOP
    v_in := jsonb_build_object('surface','city','country_name',rec.country_name,
      'equality_score',rec.equality_score,'criminalizing',rec.criminalizing,
      'death_penalty',rec.death_penalty,'penalty',rec.penalty,'unions_summary',rec.unions_summary,
      'marriage',rec.marriage,'marriage_since',rec.marriage_since,'city_name',rec.city_name,
      'density',jsonb_build_object('venues',rec.venues,'events',rec.events,'villages',rec.villages));
    v_out := public.compose_safety_note(v_in);
    CONTINUE WHEN NOT (v_out->>'auto_publishable')::boolean;  -- never touches criminalizing/moderate

    UPDATE public.cities SET
      safety_notes = v_out->>'note',
      field_provenance = jsonb_set(coalesce(field_provenance,'{}'::jsonb), ARRAY['safety_notes'],
        jsonb_build_object('value',v_out->>'note','source','derived',
          'confidence',(v_out->>'confidence')::numeric,'risk_tier',v_out->>'risk_tier','approved_at',now()), true)
    WHERE id=rec.city_id;
    UPDATE public.city_review_queue SET status='approved', reviewer_id=auth.uid(), reviewed_at=now(),
      reviewer_note='batch-approved (safe tier)' WHERE id=rec.review_id;
    INSERT INTO public.city_consensus_audit (city_id, field, winning_value, winning_source, confidence, action, details)
    VALUES (rec.city_id,'safety_notes',jsonb_build_object('value',v_out->>'note'),'derived',
            (v_out->>'confidence')::numeric,'auto_commit',jsonb_build_object('approved_by',auth.uid(),'via','batch_safe'));
    IF NOT EXISTS (SELECT 1 FROM public.city_review_queue WHERE city_id=rec.city_id AND status='open' AND id<>rec.review_id) THEN
      UPDATE public.cities SET needs_attention=false WHERE id=rec.city_id;
    END IF;
    v_approved := v_approved + 1;
  END LOOP;

  RETURN jsonb_build_object('approved',v_approved);
END; $$;
ALTER FUNCTION public.batch_approve_safe_city_reviews() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.batch_approve_safe_city_reviews() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.batch_approve_safe_city_reviews() TO authenticated, service_role;

-- ===== 6. approve_city_review: add criminalizing-country confirm guard =======
-- Drop the old 2-arg overload so a 2-arg call is unambiguous against the new
-- defaulted 3-arg signature.
DROP FUNCTION IF EXISTS public.approve_city_review(uuid, text);
CREATE OR REPLACE FUNCTION public.approve_city_review(p_id uuid, p_note text DEFAULT NULL, p_confirm boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

  -- Outing-safety guard: approving safety content for a criminalizing destination
  -- requires explicit confirmation (the UI shows a lock + warning).
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
END; $$;
ALTER FUNCTION public.approve_city_review(uuid, text, boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.approve_city_review(uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_city_review(uuid, text, boolean) TO authenticated, service_role;

-- ===== 7. register automations (PAUSED) ======================================
INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES
  ('city_safety_backfill','Backfill city safety notes',
   'Nightly: composes city safety_notes from country legal status + LGBTQ+ density. Safe tier auto-publishes (source=derived); the rest queue for review. ≤300/run (search-trigger safe).',
   'system', false, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
   '{"type":"rpc","fn":"run_city_safety_backfill"}'::jsonb, '30 4 * * *'),
  ('hotel_safety_backfill','Backfill hotel safety notes',
   'Weekly: regenerates hotel queer_safety_notes from amenity signals (dedups misterb&b boilerplate). Leaves hand-edited notes untouched.',
   'system', false, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
   '{"type":"rpc","fn":"run_hotel_safety_backfill"}'::jsonb, '50 4 * * 0')
ON CONFLICT (slug) DO UPDATE
  SET description=EXCLUDED.description, action=EXCLUDED.action, schedule=EXCLUDED.schedule;

-- ===== 8. extend dispatch RPCs (carry forward all known slugs + new ones) =====
CREATE OR REPLACE FUNCTION public.admin_automation_run(p_slug text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_result jsonb;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role]) THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  IF p_slug = 'event_auto_archive' THEN v_result := public.run_event_auto_archive();
  ELSIF p_slug = 'staging_auto_reject_stale' THEN v_result := public.run_staging_auto_reject_stale();
  ELSIF p_slug = 'workflow_runs_purge' THEN v_result := public.run_workflow_runs_purge();
  ELSIF p_slug = 'enrichment_log_purge' THEN v_result := public.run_enrichment_log_purge();
  ELSIF p_slug = 'event_trust_recompute' THEN v_result := public.run_event_trust_recompute();
  ELSIF p_slug = 'event_coverage_radar' THEN v_result := public.run_event_coverage_radar();
  ELSIF p_slug = 'venue_coord_snap' THEN v_result := public.run_venue_coord_snap();
  ELSIF p_slug = 'city_trust_recompute' THEN v_result := public.run_city_trust_recompute();
  ELSIF p_slug = 'city_coverage_radar' THEN v_result := public.run_city_coverage_radar();
  ELSIF p_slug = 'city_safety_backfill' THEN v_result := public.run_city_safety_backfill();
  ELSIF p_slug = 'hotel_safety_backfill' THEN v_result := public.run_hotel_safety_backfill();
  ELSE RAISE EXCEPTION 'unknown automation slug: %', p_slug USING ERRCODE='22023'; END IF;
  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_automation_dry_run(p_slug text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_automation_id uuid; v_examined int := 0; v_started_at timestamptz := now();
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role,'moderator'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  SELECT id INTO v_automation_id FROM public.admin_automations WHERE slug = p_slug;
  IF v_automation_id IS NULL THEN
    RAISE EXCEPTION 'unknown automation slug: %', p_slug USING ERRCODE='22023'; END IF;

  IF p_slug = 'event_auto_archive' THEN
    SELECT count(*) INTO v_examined FROM public.events
    WHERE status='active' AND end_date IS NOT NULL AND end_date < now() - interval '7 days';
  ELSIF p_slug = 'staging_auto_reject_stale' THEN
    SELECT count(*) INTO v_examined FROM public.ingestion_staging
    WHERE review_status='pending_review' AND disposition='pending' AND created_at < now() - interval '60 days';
  ELSIF p_slug = 'workflow_runs_purge' THEN
    SELECT count(*) INTO v_examined FROM public.workflow_runs
    WHERE status='completed' AND started_at < now() - interval '30 days';
  ELSIF p_slug = 'enrichment_log_purge' THEN
    SELECT count(*) INTO v_examined FROM public.enrichment_log
    WHERE status IN ('skipped','done') AND created_at < now() - interval '30 days';
  ELSIF p_slug = 'event_trust_recompute' THEN
    SELECT count(*) INTO v_examined FROM public.events
    WHERE duplicate_of_id IS NULL
      AND (start_date > now() - interval '7 days' OR last_verified_at IS NULL OR updated_at > now() - interval '2 days');
  ELSIF p_slug = 'event_coverage_radar' THEN
    SELECT count(*) INTO v_examined FROM public.cities WHERE is_major_city = true;
  ELSIF p_slug = 'venue_coord_snap' THEN
    SELECT count(*) INTO v_examined FROM public.venues_misplaced(NULL) WHERE is_geocodable = false;
  ELSIF p_slug = 'city_trust_recompute' THEN
    SELECT count(*) INTO v_examined FROM public.cities c
    WHERE c.duplicate_of_id IS NULL
      AND (c.last_verified_at IS NULL OR c.updated_at > c.last_verified_at OR c.last_verified_at < now() - interval '30 days');
  ELSIF p_slug = 'city_coverage_radar' THEN
    SELECT count(*) INTO v_examined FROM public.cities WHERE duplicate_of_id IS NULL;
  ELSIF p_slug = 'city_safety_backfill' THEN
    SELECT count(*) INTO v_examined FROM public.cities c
    WHERE c.duplicate_of_id IS NULL
      AND (c.safety_notes IS NULL OR length(trim(c.safety_notes))=0)
      AND coalesce(c.field_provenance->'safety_notes'->>'source','') <> 'llm+human'
      AND NOT EXISTS (SELECT 1 FROM public.city_review_queue q
                      WHERE q.city_id=c.id AND q.field='safety_notes' AND q.status='open');
  ELSIF p_slug = 'hotel_safety_backfill' THEN
    SELECT count(*) INTO v_examined FROM public.hotels h
    WHERE h.queer_safety_notes IS NULL
       OR h.queer_safety_notes ILIKE 'LGBTQ+-host accommodation listed on misterb&b%'
       OR h.queer_safety_notes ILIKE '%equality score%';
  ELSE RAISE EXCEPTION 'unknown automation slug: %', p_slug USING ERRCODE='22023'; END IF;

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, finished_at, status, items_examined, items_changed, summary)
  VALUES (v_automation_id, p_slug, v_started_at, now(), 'dry_run', v_examined, 0,
          jsonb_build_object('mode','dry_run','would_change',v_examined));
  RETURN jsonb_build_object('would_change', v_examined);
END; $$;

-- ===== 9. cron: SQL backfill jobs (no-op while paused) =======================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='city_safety_backfill')  THEN PERFORM cron.unschedule('city_safety_backfill');  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='hotel_safety_backfill') THEN PERFORM cron.unschedule('hotel_safety_backfill'); END IF;
END $$;
SELECT cron.schedule('city_safety_backfill',  '30 4 * * *', 'SELECT public.run_city_safety_backfill();');
SELECT cron.schedule('hotel_safety_backfill', '50 4 * * 0', 'SELECT public.run_hotel_safety_backfill();');
