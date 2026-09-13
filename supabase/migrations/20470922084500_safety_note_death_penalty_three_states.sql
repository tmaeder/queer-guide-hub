-- ============================================================================
-- Safety notes understate the death penalty for five countries
-- ============================================================================
-- `20260904203201` established that "death" is THREE states, not a boolean:
-- ILGA splits the fact across `death_penalty` and `penalty`, and neither is
-- sufficient alone. Nigeria is death_penalty='Yes' with a prison-only penalty,
-- while AF/AE/PK/QA/SO are death_penalty='No legal certainty' with
-- penalty='Death Penalty (possible)' — ILGA recording that it CANNOT RULE OUT
-- execution, which every `= 'yes'` test reads as identical to `No`.
--
-- That migration created `death_penalty_risk()` and repointed
-- `location_is_high_risk()`. IT DID NOT TOUCH `compose_safety_note()`, which is
-- what writes the prose a reader actually sees. Its own header predicted the
-- outcome it did not deliver:
--
--     compose_safety_note for Kabul today -> 'high',     "...(penalty: Death Penalty (possible))"
--     with this fix                       -> 'critical', "...can carry the death penalty"
--     8 published city notes sit in these five countries (AE 4, AF 2, PK 2)
--
-- MEASURED ON PROD 2026-09-11, one year later — all 8 are still wrong, and the
-- split against the other cohort is what proves the boolean is the mechanism:
--
--     dp_risk      countries                       published notes   burying the penalty
--     confirmed    BN IR MR NG SA UG YE (7)              6                   0
--     possible     AF PK QA SO AE      (5)               8                   8
--
-- `confirmed` buries none because there `='Yes'` is true and the good branch
-- fires. `possible` buries all eight because it does not.
--
-- WHY NO CALLER CHANGES. The composer receives `death_penalty`(bool) and
-- `penalty`(text) — it never sees the raw jsonb, so it cannot call
-- death_penalty_risk() on the original. Re-deriving the rule here would make a
-- THIRD copy of a fact CLAUDE.md requires be read only through that helper. So
-- the composer RECONSTRUCTS the minimal jsonb from the two fields it has and
-- routes it through the canonical helper. Measured across all 250 countries,
-- the reconstruction agrees with the real thing on every row (0 disagreements),
-- and this migration asserts that rather than trusting it — if a future ILGA
-- shape breaks the equivalence, this fails loudly instead of silently
-- understating. An explicit `death_penalty_risk` key is also accepted, so a
-- caller that HAS the jsonb can pass the truth directly and skip the
-- reconstruction entirely.
--
-- PROSE. `confirmed` keeps "can carry the death penalty" — a statement of fact.
-- `possible` gets "where the death penalty cannot be ruled out", which is what
-- ILGA's own "no legal certainty" means. It is deliberately NOT collapsed into
-- the confirmed wording: CLAUDE.md requires the two stay distinct, because a
-- surface stating a fact uses `confirmed` and only the "should this reader be
-- warned" question uses `<> 'none'`. Both now reach tier `critical`, which is
-- the whole point — the understatement was of EMPHASIS, not of fact, and a
-- buried parenthetical is how a death-penalty risk reads as a footnote.
--
-- The outing-safety invariant only tightens: more destinations become
-- death-penalty destinations, and those can never auto-publish.
-- ============================================================================

-- ===== 1. composer: three states, routed through the canonical helper =======
CREATE OR REPLACE FUNCTION public.compose_safety_note(p jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_surface    text    := coalesce(p->>'surface','city');
  v_country    text    := nullif(p->>'country_name','');
  v_eq         int     := nullif(p->>'equality_score','')::int;
  v_crim       boolean := coalesce((p->>'criminalizing')::boolean, false);
  v_death_in   boolean := coalesce((p->>'death_penalty')::boolean, false);
  v_penalty    text    := nullif(p->>'penalty','');
  v_dp_risk    text;
  v_death      boolean;
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
  -- Prefer an explicit verdict from a caller that holds the raw jsonb; otherwise
  -- reconstruct the two fields ILGA splits the fact across and ask the ONE
  -- implementation of the rule. Never re-implement the branch order here — the
  -- affirmative `death_penalty` test must precede the `penalty` fallback or
  -- Nigeria breaks, and that ordering lives in death_penalty_risk().
  v_dp_risk := coalesce(
    nullif(p->>'death_penalty_risk',''),
    public.death_penalty_risk(jsonb_build_object(
      'death_penalty', CASE WHEN v_death_in THEN 'Yes' ELSE 'No' END,
      'penalty',       v_penalty)));
  v_death := (v_dp_risk <> 'none');

  -- country display name with article where conventional ("the United States")
  v_cdisp := CASE WHEN v_country IN ('United States','United Arab Emirates','United Kingdom',
      'Netherlands','Philippines','Bahamas','Maldives','Gambia','Czech Republic','Dominican Republic',
      'Central African Republic','Democratic Republic of the Congo','Republic of the Congo','Comoros')
    THEN 'the '||v_country ELSE v_country END;

  -- risk tier (mirrors src/hooks/useTripSafety.ts: death>crim>eq<40>low).
  -- `possible` reaches 'critical' with `confirmed`: the reader's question here
  -- is whether they can be executed, and "not legally certain" is not a no.
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
    IF v_crim OR v_death THEN
      v_parts := array_append(v_parts, CASE
        WHEN v_dp_risk = 'confirmed' THEN
          format('Note: same-sex activity is criminalized in %s and can carry the death penalty.',
                 coalesce(v_cdisp,'this country'))
        WHEN v_dp_risk = 'possible' THEN
          format('Note: same-sex activity is criminalized in %s, where the death penalty cannot be ruled out.',
                 coalesce(v_cdisp,'this country'))
        ELSE
          format('Note: same-sex activity is criminalized in %s; exercise discretion.',
                 coalesce(v_cdisp,'this country'))
        END);
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
  IF v_crim OR v_death THEN
    IF v_dp_risk = 'confirmed' THEN
      v_legal := format('Same-sex activity is criminalized in %s and can carry the death penalty.',
                        coalesce(v_cdisp,'this country'));
    ELSIF v_dp_risk = 'possible' THEN
      -- ILGA's "no legal certainty" stated plainly. Not collapsed into the
      -- confirmed wording, and never buried in a parenthetical.
      v_legal := format('Same-sex activity is criminalized in %s, where the death penalty cannot be ruled out.',
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

-- ===== 2. the reconstruction is equivalent, or this migration fails =========
-- Not a belief: the composer's whole no-caller-changes design rests on it.
DO $recon$
DECLARE v_bad int; v_who text;
BEGIN
  SELECT count(*), string_agg(name||': '||real_risk||' vs '||recon_risk, '; ')
    INTO v_bad, v_who
  FROM (
    SELECT co.name,
           public.death_penalty_risk(co.lgbti_criminalization) AS real_risk,
           public.death_penalty_risk(jsonb_build_object(
             'death_penalty', CASE WHEN (co.lgbti_criminalization->>'death_penalty')='Yes' THEN 'Yes' ELSE 'No' END,
             'penalty',       co.lgbti_criminalization->>'penalty')) AS recon_risk
    FROM public.countries co
  ) x
  WHERE real_risk <> recon_risk;

  IF v_bad <> 0 THEN
    RAISE EXCEPTION 'compose_safety_note reconstruction disagrees with death_penalty_risk on % countries: %',
      v_bad, v_who;
  END IF;
END $recon$;

-- ===== 3. positive controls, one per branch =================================
DO $controls$
DECLARE
  v jsonb;
BEGIN
  -- AF: possible -> critical, plain sentence, no buried parenthetical
  SELECT public.compose_safety_note(jsonb_build_object(
    'surface','city','country_name','Afghanistan','equality_score',5,
    'criminalizing',true,'death_penalty',false,'penalty','Death Penalty (possible)',
    'city_name','Kabul','density',jsonb_build_object('venues',16,'events',0,'villages',0))) INTO v;
  IF v->>'risk_tier' <> 'critical' THEN
    RAISE EXCEPTION 'AF should be critical, got %', v->>'risk_tier'; END IF;
  IF (v->>'note') NOT LIKE '%death penalty cannot be ruled out%' THEN
    RAISE EXCEPTION 'AF note lost the plain death-penalty sentence: %', v->>'note'; END IF;
  IF (v->>'note') LIKE '%(penalty:%' THEN
    RAISE EXCEPTION 'AF note still buries the penalty: %', v->>'note'; END IF;
  IF (v->>'auto_publishable')::boolean THEN
    RAISE EXCEPTION 'AF must never auto-publish'; END IF;

  -- NG: confirmed (death_penalty='Yes' while penalty names only prison) -> the
  -- factual wording, NOT the hedged one.
  SELECT public.compose_safety_note(jsonb_build_object(
    'surface','city','country_name','Nigeria','equality_score',10,
    'criminalizing',true,'death_penalty',true,'penalty','14 years imprisonment',
    'city_name','Lagos','density',jsonb_build_object('venues',3,'events',0,'villages',0))) INTO v;
  IF v->>'risk_tier' <> 'critical' THEN
    RAISE EXCEPTION 'NG should be critical, got %', v->>'risk_tier'; END IF;
  IF (v->>'note') NOT LIKE '%can carry the death penalty%' THEN
    RAISE EXCEPTION 'NG lost the confirmed wording: %', v->>'note'; END IF;
  IF (v->>'note') LIKE '%cannot be ruled out%' THEN
    RAISE EXCEPTION 'NG must not be hedged into the possible wording: %', v->>'note'; END IF;

  -- SN: criminalizing, no death penalty -> unchanged 'high' + the parenthetical.
  -- This is the negative control: the fix must not widen into ordinary
  -- criminalizing countries.
  SELECT public.compose_safety_note(jsonb_build_object(
    'surface','city','country_name','Senegal','equality_score',5,
    'criminalizing',true,'death_penalty',false,'penalty','10 years to life in prison',
    'city_name','Dakar','density',jsonb_build_object('venues',7,'events',0,'villages',0))) INTO v;
  IF v->>'risk_tier' <> 'high' THEN
    RAISE EXCEPTION 'SN should stay high, got %', v->>'risk_tier'; END IF;
  IF (v->>'note') NOT LIKE '%(penalty: 10 years to life in prison)%' THEN
    RAISE EXCEPTION 'SN lost its penalty detail: %', v->>'note'; END IF;

  -- DE: legal, high equality -> low and still auto-publishable.
  SELECT public.compose_safety_note(jsonb_build_object(
    'surface','city','country_name','Germany','equality_score',80,
    'criminalizing',false,'death_penalty',false,'penalty','No criminalisation',
    'unions_summary','Marriage','marriage','Yes','marriage_since',2017,
    'city_name','Berlin','density',jsonb_build_object('venues',100,'events',5,'villages',1))) INTO v;
  IF v->>'risk_tier' <> 'low' THEN
    RAISE EXCEPTION 'DE should be low, got %', v->>'risk_tier'; END IF;
  IF NOT (v->>'auto_publishable')::boolean THEN
    RAISE EXCEPTION 'DE should stay auto-publishable'; END IF;

  -- hotel surface in a `possible` country names the risk instead of only
  -- asking for discretion.
  SELECT public.compose_safety_note(jsonb_build_object(
    'surface','hotel','country_name','United Arab Emirates',
    'criminalizing',true,'death_penalty',false,'penalty','Death Penalty (possible)',
    'hotel_signals',jsonb_build_object('venues_nearby',true))) INTO v;
  IF (v->>'note') NOT LIKE '%death penalty cannot be ruled out%' THEN
    RAISE EXCEPTION 'hotel note understates AE: %', v->>'note'; END IF;
END $controls$;

-- ===== 4. repair the published notes that already understate ================
-- These 8 are `source='llm+human'`, which the recurring backfill selector
-- deliberately excludes — so nothing would ever revisit them. They are
-- corrected rather than RETRACTED (the precedent from 20260816112824, where
-- notes named the wrong COUNTRY): here the facts are right and only the
-- emphasis is wrong, so unpublishing would strip a death-penalty country's
-- page of its safety note entirely, which is worse for the reader than the
-- understatement.
--
-- The overwrite is guarded on the MACHINE'S OWN SIGNATURE — a note is only
-- touched when it still carries the '(penalty: ... Death ...)' parenthetical
-- that only the composer produces. A human who wrote real prose about this
-- city keeps it. The prior text is preserved on field_provenance so the change
-- is reversible, `needs_attention` is raised, and a review row is opened: a
-- correction this size should be seen by a person even though the reader gets
-- the accurate copy immediately.
DO $repair$
DECLARE
  rec record; v_in jsonb; v_out jsonb; v_fixed int := 0;
BEGIN
  FOR rec IN
    SELECT c.id AS city_id, c.name AS city_name, c.safety_notes AS old_note,
           co.name AS country_name, co.equality_score,
           (co.lgbti_criminalization->>'legal')='false' AS criminalizing,
           (co.lgbti_criminalization->>'death_penalty')='Yes' AS death_penalty,
           co.lgbti_criminalization->>'penalty' AS penalty,
           public.death_penalty_risk(co.lgbti_criminalization) AS dp_risk,
           uu.u->>'summary' AS unions_summary, uu.u->>'marriage' AS marriage,
           uu.u->>'marriage_since' AS marriage_since,
           (SELECT count(*) FROM public.venues v WHERE v.city_id=c.id) AS venues,
           (SELECT count(*) FROM public.events e WHERE e.city_id=c.id) AS events,
           (SELECT count(*) FROM public.queer_villages qv WHERE qv.city_id=c.id) AS villages
    FROM public.cities c
    JOIN public.countries co ON co.id=c.country_id
    LEFT JOIN LATERAL (SELECT CASE WHEN co.lgbti_same_sex_unions ~ '^\s*\{'
                                   THEN co.lgbti_same_sex_unions::jsonb ELSE '{}'::jsonb END AS u) uu ON true
    WHERE c.duplicate_of_id IS NULL
      AND public.death_penalty_risk(co.lgbti_criminalization) = 'possible'
      AND c.safety_notes IS NOT NULL
      AND c.safety_notes ~* '\(penalty:[^)]*death'
  LOOP
    v_in := jsonb_build_object(
      'surface','city','country_name',rec.country_name,'equality_score',rec.equality_score,
      'criminalizing',rec.criminalizing,'death_penalty',rec.death_penalty,'penalty',rec.penalty,
      'death_penalty_risk',rec.dp_risk,
      'unions_summary',rec.unions_summary,'marriage',rec.marriage,'marriage_since',rec.marriage_since,
      'city_name',rec.city_name,
      'density', jsonb_build_object('venues',rec.venues,'events',rec.events,'villages',rec.villages));
    v_out := public.compose_safety_note(v_in);

    UPDATE public.cities c
       SET safety_notes = v_out->>'note',
           needs_attention = true,
           field_provenance = jsonb_set(
             coalesce(c.field_provenance,'{}'::jsonb),
             '{safety_notes,corrected}',
             jsonb_build_object(
               'at', now(),
               'reason','death_penalty_risk=possible was read as none; tier and sentence understated',
               'migration','20470922084500',
               'from', rec.old_note,
               'tier_after', v_out->>'risk_tier'),
             true)
     WHERE c.id = rec.city_id;

    INSERT INTO public.entity_review_queue
      (entity_type, entity_id, field, proposed_value, citations, confidence, model, status)
    VALUES ('city', rec.city_id,'safety_notes',
      jsonb_build_object('value',v_out->>'note',
        'rationale','Corrected: death penalty risk is "possible" (ILGA: no legal certainty), previously rendered as a parenthetical at tier high',
        'risk_tier',v_out->>'risk_tier'),
      '[]'::jsonb, (v_out->>'confidence')::numeric, 'composer:derived','open')
    ON CONFLICT (entity_type, entity_id, field) WHERE status='open'
    DO UPDATE SET proposed_value=EXCLUDED.proposed_value, confidence=EXCLUDED.confidence,
                  model=EXCLUDED.model, created_at=now();

    v_fixed := v_fixed + 1;
  END LOOP;

  RAISE NOTICE 'safety-note death-penalty repair: % notes corrected', v_fixed;
END $repair$;

-- ===== 5. postconditions ====================================================
DO $verify$
DECLARE v_buried int; v_understated int;
BEGIN
  -- No published note in a death-penalty country may bury the penalty.
  SELECT count(*) INTO v_buried
    FROM public.cities c JOIN public.countries co ON co.id=c.country_id
   WHERE c.duplicate_of_id IS NULL
     AND public.death_penalty_risk(co.lgbti_criminalization) <> 'none'
     AND c.safety_notes ~* '\(penalty:[^)]*death';
  IF v_buried <> 0 THEN
    RAISE EXCEPTION '% published notes still bury a death penalty in a parenthetical', v_buried;
  END IF;

  -- Every published note in a `possible` country now names the risk plainly.
  SELECT count(*) INTO v_understated
    FROM public.cities c JOIN public.countries co ON co.id=c.country_id
   WHERE c.duplicate_of_id IS NULL
     AND public.death_penalty_risk(co.lgbti_criminalization) = 'possible'
     AND c.safety_notes IS NOT NULL
     AND c.safety_notes NOT ILIKE '%death penalty%';
  IF v_understated <> 0 THEN
    RAISE EXCEPTION '% published notes in possible-death-penalty countries never mention it', v_understated;
  END IF;
END $verify$;
