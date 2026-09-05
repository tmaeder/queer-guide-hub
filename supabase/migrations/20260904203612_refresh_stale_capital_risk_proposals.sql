-- Refresh the OPEN safety-note proposals that were composed before death_penalty_risk().
--
-- The previous migration flagged the eight cities with a PUBLISHED note. It missed the
-- larger set: `entity_review_queue` already held ~62 open proposals for cities in the same
-- five countries, composed by earlier nightly runs at the old tier. They read "(penalty:
-- Death Penalty (possible))" at risk_tier 'high' — so an admin working the queue would have
-- approved an understated note for Kabul, Doha, Mogadishu, Sharjah and the rest, and the
-- act of approving would have PUBLISHED it.
--
-- A stale proposal is worse than a stale note: a note merely sits there, whereas a proposal
-- is a button a human is invited to press. Fixing the composer without refreshing the queue
-- would have left the wrong text one click from publication on exactly the destinations
-- this correction is about.
--
-- Only `status='open'` rows are touched, and only in countries the corrected function reads
-- as `possible`. Nothing is published here.

DO $$
DECLARE rec record; v_out jsonb; v_n int := 0; v_crit int := 0;
BEGIN
  FOR rec IN
    SELECT q.id AS qid, c.id AS city_id, c.name AS city_name,
           co.name AS country_name, co.equality_score,
           (co.lgbti_criminalization->>'legal')='false' AS criminalizing,
           co.lgbti_criminalization->>'penalty' AS penalty,
           (SELECT count(*) FROM public.venues v WHERE v.city_id=c.id) AS venues,
           (SELECT count(*) FROM public.events e WHERE e.city_id=c.id) AS events,
           (SELECT count(*) FROM public.queer_villages g WHERE g.city_id=c.id) AS villages
      FROM public.entity_review_queue q
      JOIN public.cities c   ON c.id = q.entity_id
      JOIN public.countries co ON co.id = c.country_id
     WHERE q.entity_type='city' AND q.field='safety_notes' AND q.status='open'
       AND public.death_penalty_risk(co.lgbti_criminalization) = 'possible'
  LOOP
    v_out := public.compose_safety_note(jsonb_build_object(
      'surface','city','country_name',rec.country_name,'equality_score',rec.equality_score,
      'criminalizing',rec.criminalizing,'death_penalty',true,'penalty',rec.penalty,
      'unions_summary',NULL,'marriage',NULL,'marriage_since',NULL,'city_name',rec.city_name,
      'density', jsonb_build_object('venues',rec.venues,'events',rec.events,'villages',rec.villages)));

    IF (v_out->>'auto_publishable')::boolean THEN
      RAISE EXCEPTION 'composer offered auto-publish for criminalising % — invariant broken', rec.country_name;
    END IF;

    UPDATE public.entity_review_queue SET
      proposed_value = jsonb_build_object('value', v_out->>'note',
        'rationale','Recomposed: country records a POSSIBLE death penalty ("No legal certainty" + "Death Penalty (possible)"), which the SQL layer previously read as none. Earlier proposal understated the tier.',
        'risk_tier', v_out->>'risk_tier'),
      confidence = (v_out->>'confidence')::numeric,
      model = 'composer:derived',
      created_at = now()
    WHERE id = rec.qid;

    v_n := v_n + 1;
    IF (v_out->>'risk_tier') = 'critical' THEN v_crit := v_crit + 1; END IF;
  END LOOP;

  RAISE NOTICE 'refreshed % proposals, % now critical', v_n, v_crit;
  IF v_n = 0 THEN RAISE EXCEPTION 'refreshed nothing — contradicts the measured queue'; END IF;
END $$;

DO $$
DECLARE v_stale int;
BEGIN
  SELECT count(*) INTO v_stale
    FROM public.entity_review_queue q
    JOIN public.cities c ON c.id = q.entity_id
    JOIN public.countries co ON co.id = c.country_id
   WHERE q.entity_type='city' AND q.field='safety_notes' AND q.status='open'
     AND public.death_penalty_risk(co.lgbti_criminalization) = 'possible'
     AND (q.proposed_value->>'risk_tier') IS DISTINCT FROM 'critical';
  IF v_stale <> 0 THEN
    RAISE EXCEPTION '% open proposals in possible-death-penalty countries are still not critical', v_stale;
  END IF;
END $$;
