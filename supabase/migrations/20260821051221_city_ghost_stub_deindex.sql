-- Deindex the zero-content "ghost" stub tier (product decision 2026-08-21).
--
-- `run_city_trust_recompute`'s shell classifier required `seo_indexable=true`
-- to route a zero-venue/zero-event city into the 'ghost' bucket
-- (`WHEN seo_indexable AND is_empty THEN 'ghost'`), by original design
-- (20260607100000: "ghost (indexable, zero venues+events)"). 144 live stub
-- cities (avg completeness 19/100, 78% with no description at all) are
-- consequently crawlable — the same thin/soft-404 class this codebase
-- otherwise treats as a bug (tag slugs, personhood non-persons).
--
-- The column can't just be flipped: the classifier's own condition depends
-- on seo_indexable already being true, so setting it false would reclassify
-- the row to 'real' on the next pass (worse — a zero-content city then reads
-- as a legitimate complete one in every admin view and selector). Fixing it
-- means the classifier itself:
--   * 'ghost' no longer requires seo_indexable — it's purely `is_empty` now.
--   * seo_indexable is explicitly set false whenever a row lands in 'ghost'.
--   * seo_indexable is restored to true when a row LEAVES the ghost tier
--     because it gained real content (old shell_status='ghost', now non-empty)
--     — never touched otherwise, so the 782 'real' cities that are
--     seo_indexable=false for unrelated reasons are left alone.
--   * the tmp-% placeholder branch is untouched (already uniformly
--     non-indexable; this migration doesn't touch that invariant).

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
    SELECT c.id, c.slug, c.shell_status, c.seo_indexable, c.completeness_score, c.lgbt_friendly_rating,
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
    SELECT s.id, s.slug, s.shell_status, s.seo_indexable, s.needs_attention,
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
           WHEN is_empty THEN 'ghost'
           ELSE 'real' END AS new_shell,
      CASE WHEN slug LIKE 'tmp-%' THEN seo_indexable
           WHEN is_empty THEN false
           WHEN shell_status = 'ghost' THEN true
           ELSE seo_indexable END AS new_seo_indexable,
      CASE
        WHEN slug LIKE 'tmp-%' THEN 5
        WHEN is_empty THEN 15
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
        seo_indexable = f.new_seo_indexable,
        last_verified_at = now()
  FROM final f
  WHERE c.id = f.id
    AND (c.trust_score IS DISTINCT FROM f.new_trust
         OR c.shell_status IS DISTINCT FROM f.new_shell
         OR c.seo_indexable IS DISTINCT FROM f.new_seo_indexable);
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
