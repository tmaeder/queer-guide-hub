-- Event trust recompute — signal-aware dynamic reweighting.
--
-- The original composite used fixed weights with neutral 0.5 defaults for
-- corroboration + admin_feedback and 0 for engagement. But this corpus is
-- single-source (only 1 event has >=2 sources, so corroboration never has a real
-- signal), engagement is 0 for events that predate the social features, and no
-- job writes admin_feedback. Result: ~45% of the composite was constant noise
-- (0.5 + 0.5 + 0), structurally capping every event near 60 regardless of how
-- good it actually is.
--
-- Fix: include a dimension's weight ONLY when it carries a real signal, then
-- renormalize across the present dimensions. completeness/freshness/relevance are
-- always present. corroboration is present iff the event has >=2 sources OR a
-- verified liveness ('live'/'sold_out') — a live re-fetch is corroboration of the
-- core facts. engagement present iff there are RSVPs/favourites. admin_feedback
-- present iff an admin actually left a signal. Dead/cancelled hard-cap (10) and
-- the needs_attention penalty are preserved.

CREATE OR REPLACE FUNCTION public.run_event_trust_recompute()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_automation_id uuid; v_run_id bigint; v_enabled boolean;
  v_started_at timestamptz := now(); v_changed int := 0; v_examined int := 0;
BEGIN
  SELECT id, enabled INTO v_automation_id, v_enabled FROM public.admin_automations WHERE slug = 'event_trust_recompute';
  INSERT INTO public.admin_automation_runs (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  VALUES (v_automation_id, 'event_trust_recompute', v_started_at, 'success', 0, 0) RETURNING id INTO v_run_id;
  IF v_enabled IS DISTINCT FROM true THEN
    UPDATE public.admin_automation_runs SET finished_at=now(), summary=jsonb_build_object('skipped',true,'reason','paused') WHERE id=v_run_id;
    UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='paused' WHERE id=v_automation_id;
    RETURN jsonb_build_object('skipped',true,'reason','paused');
  END IF;
  WITH scope AS (
    SELECT id, quality_score, lgbti_relevance_score, liveness_status, needs_attention, start_date, updated_at, last_verified_at
    FROM public.events
    WHERE duplicate_of_id IS NULL
      AND (start_date > now() - interval '7 days' OR last_verified_at IS NULL OR updated_at > now() - interval '2 days')
  ),
  corr AS (SELECT DISTINCT ON (event_id) event_id, value FROM public.event_quality_signals WHERE signal_type='corroboration' ORDER BY event_id, created_at DESC),
  adminfb AS (SELECT DISTINCT ON (event_id) event_id, value FROM public.event_quality_signals WHERE signal_type='admin_feedback' ORDER BY event_id, created_at DESC),
  srccnt AS (SELECT s.id AS event_id, (SELECT count(*) FROM public.event_sources es WHERE es.event_id = s.id) AS n FROM scope s),
  eng AS (
    SELECT s.id AS event_id,
      (SELECT count(*) FROM public.event_attendees a WHERE a.event_id=s.id AND a.status IN ('going','interested')) AS rsvps,
      (SELECT count(*) FROM public.event_favorites f WHERE f.event_id=s.id) AS favs
    FROM scope s
  ),
  scored AS (
    SELECT s.id,
      least(1.0, greatest(0.0, coalesce(s.quality_score,0)/100.0)) AS completeness,
      exp(-greatest(0, extract(epoch FROM now()-coalesce(s.last_verified_at,s.updated_at))/86400.0)/30.0) AS freshness,
      coalesce(s.lgbti_relevance_score, 0.5)::numeric AS relevance,
      -- corroboration: present iff multi-source OR verified live
      (coalesce(sc.n,0) >= 2 OR s.liveness_status IN ('live','sold_out')) AS corr_present,
      coalesce(c.value, CASE WHEN s.liveness_status IN ('live','sold_out') THEN 0.8 ELSE 0.6 END) AS corroboration,
      -- engagement: present iff any RSVP/favourite
      (coalesce(e.rsvps,0) + coalesce(e.favs,0) > 0) AS eng_present,
      least(1.0, (coalesce(e.rsvps,0)*2 + coalesce(e.favs,0))/20.0) AS engagement,
      -- admin feedback: present iff an admin left a signal
      (a.value IS NOT NULL) AS adm_present,
      coalesce(a.value, 0.5) AS admin_feedback,
      s.liveness_status, s.needs_attention
    FROM scope s
    LEFT JOIN corr c ON c.event_id=s.id
    LEFT JOIN adminfb a ON a.event_id=s.id
    LEFT JOIN srccnt sc ON sc.event_id=s.id
    LEFT JOIN eng e ON e.event_id=s.id
  ),
  composed AS (
    SELECT id, liveness_status, needs_attention,
      ( 0.25*completeness + 0.15*freshness + 0.15*relevance
        + CASE WHEN corr_present THEN 0.20*corroboration ELSE 0 END
        + CASE WHEN eng_present  THEN 0.15*engagement    ELSE 0 END
        + CASE WHEN adm_present  THEN 0.10*admin_feedback ELSE 0 END
      ) AS num,
      ( 0.55
        + CASE WHEN corr_present THEN 0.20 ELSE 0 END
        + CASE WHEN eng_present  THEN 0.15 ELSE 0 END
        + CASE WHEN adm_present  THEN 0.10 ELSE 0 END
      ) AS den
    FROM scored
  ),
  final AS (
    SELECT id,
      CASE WHEN liveness_status IN ('dead_link','cancelled') THEN 10
        ELSE round(100 * greatest(0.0, least(1.0,
              (num/den) - CASE WHEN needs_attention THEN 0.15 ELSE 0 END)))
      END::smallint AS new_trust
    FROM composed
  )
  UPDATE public.events ev SET trust_score = f.new_trust, last_verified_at = now()
  FROM final f WHERE ev.id = f.id AND ev.trust_score IS DISTINCT FROM f.new_trust;
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  SELECT count(*) INTO v_examined FROM public.events
  WHERE duplicate_of_id IS NULL AND (start_date > now() - interval '7 days' OR last_verified_at IS NULL OR updated_at > now() - interval '2 days');
  UPDATE public.admin_automation_runs SET finished_at=now(), items_examined=v_examined, items_changed=v_changed,
    summary=jsonb_build_object('rescored',v_changed,'examined',v_examined) WHERE id=v_run_id;
  UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='success' WHERE id=v_automation_id;
  RETURN jsonb_build_object('rescored',v_changed,'examined',v_examined);
EXCEPTION WHEN OTHERS THEN
  UPDATE public.admin_automation_runs SET finished_at=now(), status='error', error=SQLERRM WHERE id=v_run_id;
  UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='error' WHERE id=v_automation_id;
  RAISE;
END; $function$;
