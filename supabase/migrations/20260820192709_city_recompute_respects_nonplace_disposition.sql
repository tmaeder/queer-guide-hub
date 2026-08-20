-- `run_city_trust_recompute` / `run_city_completeness_recompute` scope every
-- non-duplicate city with no exclusion for `archive_city_as_nonplace`'s
-- disposition marker (`enrichment_status.disposition.state = 'not_a_city'`).
-- `cities_due_for_refresh` (20260801140449) already guards on this exact
-- predicate — the nightly recompute jobs never got the same guard.
--
-- Consequence, reproduced live: "Americas" and "Thebes" were archived via
-- archive_city_as_nonplace on 2026-08-19 (shell_status='ghost',
-- seo_indexable=false). The very next `run_city_trust_recompute` pass
-- (2026-08-20 03:45 UTC) recomputed `is_empty` for them (true — archiving
-- requires zero venues/events), but its shell CASE only maps to 'ghost' when
-- `seo_indexable` is ALSO true; for an archived row seo_indexable is false, so
-- it fell through to the tmp-slug branch and flipped shell_status back to
-- 'placeholder' — silently undoing the archive's shell_status half within
-- 12 hours, with no audit trail beyond the trust_score/shell_status diff.
-- `needs_attention` and `seo_indexable` were untouched (this function never
-- writes seo_indexable), so the row stayed non-indexable — the SEO
-- consequence of un-archiving was contained, but city_coverage_gaps and any
-- shell_status='ghost' filter would now miss the row entirely, and a future
-- selector change that trusts shell_status over the disposition marker would
-- re-surface it for enrichment attempts already proven to fail 3x.
--
-- Fix: both functions gain the same disposition guard `cities_due_for_refresh`
-- already uses. `run_city_completeness_recompute` only ever writes
-- `completeness_score` (never shell_status/seo_indexable), so its half of this
-- was harmless — included anyway so both recompute jobs share one invariant
-- instead of one of them silently depending on the other never drifting.
--
-- NOT in scope here: the unrelated `shell_status='ghost'` tier this same
-- migration's foundation also defines for zero-content auto-created stub
-- cities (`WHEN seo_indexable AND is_empty THEN 'ghost'`, comment: "ghost
-- (indexable, zero venues+events)") is a second, deliberate meaning of the
-- same enum value and is left untouched — whether 144 near-empty stub city
-- pages should stay crawlable is a product call, not a bug fix.

CREATE OR REPLACE FUNCTION public.run_city_trust_recompute(p_force boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_automation_id uuid;
  v_run_id        bigint;
  v_enabled       boolean;
  v_started_at    timestamptz := now();
  v_changed       int := 0;
  v_examined      int := 0;
BEGIN
  SELECT id, enabled INTO v_automation_id, v_enabled
  FROM public.admin_automations WHERE slug = 'city_trust_recompute';

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  VALUES (v_automation_id, 'city_trust_recompute', v_started_at, 'success', 0, 0)
  RETURNING id INTO v_run_id;

  IF (v_enabled IS DISTINCT FROM true) AND NOT p_force THEN
    UPDATE public.admin_automation_runs
      SET finished_at=now(), summary=jsonb_build_object('skipped',true,'reason','paused') WHERE id=v_run_id;
    UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='paused' WHERE id=v_automation_id;
    RETURN jsonb_build_object('skipped',true,'reason','paused');
  END IF;

  WITH scope AS (
    SELECT c.id, c.slug, c.seo_indexable, c.completeness_score, c.lgbt_friendly_rating,
           c.needs_attention, c.last_refreshed_at, c.updated_at, c.last_verified_at
    FROM public.cities c
    WHERE c.duplicate_of_id IS NULL
      AND COALESCE(c.enrichment_status->'disposition'->>'state', '') <> 'not_a_city'
      AND (p_force
           OR c.last_verified_at IS NULL
           OR c.updated_at > c.last_verified_at
           OR c.last_verified_at < now() - interval '30 days')
  ),
  counts AS (
    SELECT s.id,
      (SELECT count(*) FROM public.venues v   WHERE v.city_id=s.id AND v.duplicate_of_id IS NULL) AS venues,
      (SELECT count(*) FROM public.events e   WHERE e.city_id=s.id AND e.duplicate_of_id IS NULL) AS events,
      (SELECT count(*) FROM public.queer_villages q WHERE q.city_id=s.id) AS villages,
      (SELECT count(*) FROM public.festivals f WHERE f.city_id=s.id) AS festivals,
      (SELECT count(*) FROM public.hotels h    WHERE h.city_id=s.id) AS hotels
    FROM scope s
  ),
  corr AS (
    SELECT DISTINCT ON (city_id) city_id, value
    FROM public.city_quality_signals WHERE signal_type='corroboration'
    ORDER BY city_id, created_at DESC
  ),
  relsig AS (
    SELECT DISTINCT ON (city_id) city_id, value
    FROM public.city_quality_signals WHERE signal_type='relevance'
    ORDER BY city_id, created_at DESC
  ),
  adminfb AS (
    SELECT DISTINCT ON (city_id) city_id, value
    FROM public.city_quality_signals WHERE signal_type='admin_feedback'
    ORDER BY city_id, created_at DESC
  ),
  scored AS (
    SELECT s.id, s.slug, s.seo_indexable, s.needs_attention,
      least(1.0, greatest(0.0, coalesce(s.completeness_score,0)/100.0)) AS completeness,
      least(1.0, ln(1 + co.venues + co.events + co.villages + co.festivals + co.hotels) / ln(31)) AS content_density,
      coalesce(cr.value, 0.5) AS corroboration,
      coalesce(s.lgbt_friendly_rating::numeric/5.0, rs.value, 0.5) AS relevance,
      exp(-greatest(0, extract(epoch FROM now()-coalesce(s.last_refreshed_at,s.updated_at))/86400.0)/90.0) AS freshness,
      coalesce(af.value, 0.5) AS admin_feedback,
      (co.venues=0 AND co.events=0) AS is_empty
    FROM scope s
    JOIN counts co    ON co.id=s.id
    LEFT JOIN corr cr ON cr.city_id=s.id
    LEFT JOIN relsig rs ON rs.city_id=s.id
    LEFT JOIN adminfb af ON af.city_id=s.id
  ),
  final AS (
    SELECT id,
      CASE WHEN slug LIKE 'tmp-%' THEN 'placeholder'
           WHEN seo_indexable AND is_empty THEN 'ghost'
           ELSE 'real' END AS new_shell,
      CASE
        WHEN slug LIKE 'tmp-%' THEN 5
        WHEN seo_indexable AND is_empty THEN 15
        ELSE round(100 * greatest(0.0, least(1.0,
              0.30*completeness + 0.25*content_density + 0.15*corroboration
            + 0.15*relevance    + 0.10*freshness       + 0.05*admin_feedback
            - CASE WHEN needs_attention THEN 0.15 ELSE 0 END)))
      END::smallint AS new_trust
    FROM scored
  )
  UPDATE public.cities c
    SET trust_score = f.new_trust,
        shell_status = f.new_shell,
        last_verified_at = now()
  FROM final f
  WHERE c.id = f.id
    AND (c.trust_score IS DISTINCT FROM f.new_trust OR c.shell_status IS DISTINCT FROM f.new_shell);
  GET DIAGNOSTICS v_changed = ROW_COUNT;

  SELECT count(*) INTO v_examined FROM public.cities c
  WHERE c.duplicate_of_id IS NULL
    AND COALESCE(c.enrichment_status->'disposition'->>'state', '') <> 'not_a_city'
    AND (p_force OR c.last_verified_at IS NULL OR c.updated_at > c.last_verified_at
         OR c.last_verified_at < now() - interval '30 days');

  UPDATE public.admin_automation_runs
    SET finished_at=now(), items_examined=v_examined, items_changed=v_changed,
        summary=jsonb_build_object('rescored',v_changed,'examined',v_examined,'forced',p_force) WHERE id=v_run_id;
  UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='success' WHERE id=v_automation_id;
  RETURN jsonb_build_object('rescored',v_changed,'examined',v_examined);
EXCEPTION WHEN OTHERS THEN
  UPDATE public.admin_automation_runs SET finished_at=now(), status='error', error=SQLERRM WHERE id=v_run_id;
  UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='error' WHERE id=v_automation_id;
  RAISE;
END; $$;
ALTER FUNCTION public.run_city_trust_recompute(boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.run_city_trust_recompute(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_city_trust_recompute(boolean) TO service_role, authenticated;

CREATE OR REPLACE FUNCTION public.run_city_completeness_recompute(p_force boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_automation_id uuid;
  v_run_id        bigint;
  v_enabled       boolean;
  v_started_at    timestamptz := now();
  v_changed       int := 0;
  v_examined      int := 0;
BEGIN
  SELECT id, enabled INTO v_automation_id, v_enabled
  FROM public.admin_automations WHERE slug = 'city_completeness_recompute';

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  VALUES (v_automation_id, 'city_completeness_recompute', v_started_at, 'success', 0, 0)
  RETURNING id INTO v_run_id;

  IF (v_enabled IS DISTINCT FROM true) AND NOT p_force THEN
    UPDATE public.admin_automation_runs
      SET finished_at=now(), summary=jsonb_build_object('skipped',true,'reason','paused') WHERE id=v_run_id;
    UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='paused' WHERE id=v_automation_id;
    RETURN jsonb_build_object('skipped',true,'reason','paused');
  END IF;

  WITH scope AS (
    SELECT c.id, public.compute_city_completeness(c.id) AS new_score
    FROM public.cities c
    WHERE c.duplicate_of_id IS NULL
      AND COALESCE(c.enrichment_status->'disposition'->>'state', '') <> 'not_a_city'
      AND (p_force OR c.last_verified_at IS NULL OR c.updated_at > c.last_verified_at
           OR c.last_verified_at < now() - interval '30 days')
  ),
  upd AS (
    UPDATE public.cities c SET completeness_score = s.new_score
    FROM scope s
    WHERE c.id = s.id AND c.completeness_score IS DISTINCT FROM s.new_score
    RETURNING c.id, s.new_score
  ),
  sig AS (
    INSERT INTO public.city_quality_signals (city_id, signal_type, value, source)
    SELECT id, 'completeness', (new_score/100.0)::numeric(5,4), 'completeness_recompute' FROM upd
    RETURNING 1
  )
  SELECT count(*) INTO v_changed FROM upd;

  SELECT count(*) INTO v_examined FROM public.cities c
  WHERE c.duplicate_of_id IS NULL
    AND COALESCE(c.enrichment_status->'disposition'->>'state', '') <> 'not_a_city'
    AND (p_force OR c.last_verified_at IS NULL OR c.updated_at > c.last_verified_at
         OR c.last_verified_at < now() - interval '30 days');

  UPDATE public.admin_automation_runs
    SET finished_at=now(), items_examined=v_examined, items_changed=v_changed,
        summary=jsonb_build_object('rescored',v_changed,'examined',v_examined,'forced',p_force) WHERE id=v_run_id;
  UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='success' WHERE id=v_automation_id;
  RETURN jsonb_build_object('rescored',v_changed,'examined',v_examined);
EXCEPTION WHEN OTHERS THEN
  UPDATE public.admin_automation_runs SET finished_at=now(), status='error', error=SQLERRM WHERE id=v_run_id;
  UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='error' WHERE id=v_automation_id;
  RAISE;
END; $$;
ALTER FUNCTION public.run_city_completeness_recompute(boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.run_city_completeness_recompute(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_city_completeness_recompute(boolean) TO service_role, authenticated;

-- One-time repair: restore the two rows the bug already flipped. Both are
-- still seo_indexable=false / needs_attention=true (this function never
-- touched those), so only shell_status drifted.
UPDATE public.cities
SET shell_status = 'ghost'
WHERE duplicate_of_id IS NULL
  AND enrichment_status->'disposition'->>'state' = 'not_a_city'
  AND shell_status <> 'ghost';
