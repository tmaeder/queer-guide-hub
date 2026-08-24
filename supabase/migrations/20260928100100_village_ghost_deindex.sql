-- Deindex the zero-content village tier — the villages half of the fix
-- 20260821051221 applied to cities.
--
-- `run_village_trust_recompute` classifies a queer village as 'ghost' when it
-- has no venues and no events. The condition was `seo_indexable AND is_empty`,
-- and the function never wrote `seo_indexable` at all — so the flag that gates
-- the classification could only ever be true, and all 190 rows sat at
-- seo_indexable=true, 60 of them ghosts. `sitemap-villages.xml` filters ghosts
-- out, but `CityDistricts` links every village from its city page, so those 60
-- thin pages are reachable and indexable. (The edge renderer had the same hole
-- from the other side: `villageDetail` in functions/_lib/detail.ts never
-- selected the column, so the bot response was unconditionally indexable —
-- fixed in the same PR.)
--
-- Same three moves as the cities fix:
--   * 'ghost' routes on `is_empty` alone; requiring seo_indexable made the
--     condition mask its own effect (flipping the column would reclassify the
--     row to 'real', which is worse — a contentless village then reads as a
--     complete one in every admin view and selector).
--   * seo_indexable is set false whenever a row lands in 'ghost'.
--   * seo_indexable is restored to true when a row LEAVES the ghost tier by
--     gaining content (old shell_status='ghost', now non-empty) — and is never
--     touched otherwise, so a village deindexed for an unrelated reason stays
--     deindexed.
--
-- Most of these 60 are real, well-known districts (Shinjuku Ni-chōme, Cherry
-- Grove, Fire Island Pines, Green Point, Jackson Heights) that are empty only
-- because nothing links venues to villages; the `village_relink` cron added in
-- the next migration is what lets them climb back out, and this function is
-- what re-indexes them when they do.

CREATE OR REPLACE FUNCTION public.run_village_trust_recompute(p_force boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_automation_id uuid; v_run_id bigint; v_enabled boolean;
  v_started_at timestamptz := now(); v_changed int := 0; v_examined int := 0;
BEGIN
  SELECT id, enabled INTO v_automation_id, v_enabled
  FROM public.admin_automations WHERE slug = 'village_trust_recompute';

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  VALUES (v_automation_id, 'village_trust_recompute', v_started_at, 'success', 0, 0)
  RETURNING id INTO v_run_id;

  IF (v_enabled IS DISTINCT FROM true) AND NOT p_force THEN
    UPDATE public.admin_automation_runs
      SET finished_at=now(), summary=jsonb_build_object('skipped',true,'reason','paused') WHERE id=v_run_id;
    UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='paused' WHERE id=v_automation_id;
    RETURN jsonb_build_object('skipped',true,'reason','paused');
  END IF;

  WITH counts AS (
    SELECT q.id, q.seo_indexable, q.shell_status, q.completeness_score, q.needs_attention, q.history,
           q.last_refreshed_at, q.updated_at,
      (SELECT count(*) FROM public.venues v WHERE v.queer_village_id=q.id AND v.duplicate_of_id IS NULL) AS venues,
      (SELECT count(*) FROM public.events e WHERE e.queer_village_id=q.id AND e.duplicate_of_id IS NULL) AS events
    FROM public.queer_villages q
  ),
  adminfb AS (
    SELECT DISTINCT ON (village_id) village_id, value
    FROM public.village_quality_signals WHERE signal_type='admin_feedback'
    ORDER BY village_id, created_at DESC
  ),
  scored AS (
    SELECT c.id, c.seo_indexable, c.shell_status, c.needs_attention,
      least(1.0, greatest(0.0, coalesce(c.completeness_score,0)/100.0)) AS completeness,
      least(1.0, ln(1 + c.venues + c.events) / ln(11)) AS linkage,
      exp(-greatest(0, extract(epoch FROM now()-coalesce(c.last_refreshed_at,c.updated_at))/86400.0)/90.0) AS freshness,
      (CASE WHEN c.history ~* '(lgbt|lgbtq|queer|gay|lesbian|trans|pride|rainbow|drag)' THEN 1.0 ELSE 0.3 END) AS relevance,
      coalesce(af.value, 0.5) AS admin_feedback,
      (c.venues=0 AND c.events=0) AS is_empty
    FROM counts c
    LEFT JOIN adminfb af ON af.village_id=c.id
  ),
  final AS (
    SELECT id,
      CASE WHEN is_empty THEN 'ghost' ELSE 'real' END AS new_shell,
      CASE WHEN is_empty THEN false
           WHEN shell_status = 'ghost' THEN true
           ELSE seo_indexable END AS new_seo_indexable,
      CASE WHEN is_empty THEN 15
        ELSE round(100 * greatest(0.0, least(1.0,
              0.40*completeness + 0.20*linkage + 0.15*freshness
            + 0.15*relevance + 0.10*admin_feedback
            - CASE WHEN needs_attention THEN 0.15 ELSE 0 END)))
      END::smallint AS new_trust
    FROM scored
  )
  UPDATE public.queer_villages q
    SET trust_score=f.new_trust,
        shell_status=f.new_shell,
        seo_indexable=f.new_seo_indexable,
        last_verified_at=now()
  FROM final f
  WHERE q.id=f.id
    AND (q.trust_score IS DISTINCT FROM f.new_trust
         OR q.shell_status IS DISTINCT FROM f.new_shell
         OR q.seo_indexable IS DISTINCT FROM f.new_seo_indexable);
  GET DIAGNOSTICS v_changed = ROW_COUNT;

  SELECT count(*) INTO v_examined FROM public.queer_villages;

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

ALTER FUNCTION public.run_village_trust_recompute(boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.run_village_trust_recompute(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_village_trust_recompute(boolean) TO service_role;

-- Apply once now so the 60 ghosts stop being indexable at deploy time rather
-- than at 03:50 the next morning.
SELECT public.run_village_trust_recompute(true);
