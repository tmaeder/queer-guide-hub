-- Reversible disposition for rows in `cities` that are not places.
--
-- The 2026-06-10/19 bulk imports (data_source='personality-birth-place' and
-- friends) filed countries, regions and literal junk as cities: "Indonesien",
-- "Baskenland", "—N/a", "7th place". They have no venues and no events, they can
-- never resolve against Wikidata, and before the selector fix they were the
-- cohort that starved the whole enrichment loop.
--
-- Ported from archive_personality_as_nonperson (20260607400000): snapshot the
-- prior state, flip the visibility flags, provide an exact inverse. NOTHING is
-- deleted and nothing is reclassified.
--
-- Why shell_status='ghost' and NOT duplicate_of_id: duplicate_of_id asserts
-- "this row IS that row", and the 12 merge cores, dedup_review_queue and
-- guide_picks_maintain() all repoint content through it. "Indonesien" is not a
-- duplicate of anything — there is no city to point at. 'merged' is reserved for
-- duplicate_of_id IS NOT NULL. 'ghost' already exists in cities_shell_status_check.

CREATE OR REPLACE FUNCTION public.archive_city_as_nonplace(
  p_id uuid, p_reason text, p_signals jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  r public.cities%ROWTYPE;
  v_existing jsonb;
  v_archived jsonb;
BEGIN
  IF (SELECT auth.uid()) IS NOT NULL
     AND NOT has_any_role_jwt(ARRAY['admin'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO r FROM public.cities WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found', 'id', p_id);
  END IF;

  -- Refuse to archive anything that actually has content. A false positive here
  -- silently delists a real destination, so this guard is not advisory.
  IF EXISTS (SELECT 1 FROM public.venues v WHERE v.city_id = p_id)
     OR EXISTS (SELECT 1 FROM public.events e WHERE e.city_id = p_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'has_content', 'id', p_id, 'name', r.name);
  END IF;

  v_existing := coalesce(r.enrichment_status->'disposition', '{}'::jsonb);
  -- Snapshot once; a re-run must not overwrite the original pre-archive state.
  v_archived := CASE
    WHEN v_existing ? 'archived' THEN v_existing->'archived'
    ELSE jsonb_build_object('shell_status', r.shell_status,
                            'seo_indexable', r.seo_indexable,
                            'needs_attention', r.needs_attention)
  END;

  UPDATE public.cities SET
    shell_status = 'ghost',
    seo_indexable = false,
    needs_attention = true,
    enrichment_status = jsonb_set(
      coalesce(enrichment_status, '{}'::jsonb), '{disposition}',
      jsonb_build_object('state', 'not_a_city', 'reason', p_reason,
                         'signals', coalesce(p_signals, '{}'::jsonb),
                         'archived', v_archived, 'at', now()), true)
  WHERE id = p_id;

  RETURN jsonb_build_object('ok', true, 'id', p_id, 'name', r.name, 'archived', v_archived);
END; $function$;

CREATE OR REPLACE FUNCTION public.unarchive_city(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  r public.cities%ROWTYPE;
  v_snap jsonb;
BEGIN
  IF (SELECT auth.uid()) IS NOT NULL
     AND NOT has_any_role_jwt(ARRAY['admin'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO r FROM public.cities WHERE id = p_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;

  v_snap := r.enrichment_status->'disposition'->'archived';
  IF v_snap IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_archived', 'id', p_id);
  END IF;

  UPDATE public.cities SET
    shell_status   = coalesce(v_snap->>'shell_status', 'placeholder'),
    seo_indexable  = coalesce((v_snap->>'seo_indexable')::boolean, true),
    needs_attention = coalesce((v_snap->>'needs_attention')::boolean, false),
    enrichment_status = coalesce(enrichment_status, '{}'::jsonb) - 'disposition'
  WHERE id = p_id;

  RETURN jsonb_build_object('ok', true, 'id', p_id, 'name', r.name, 'restored', v_snap);
END; $function$;

ALTER FUNCTION public.archive_city_as_nonplace(uuid, text, jsonb) OWNER TO postgres;
ALTER FUNCTION public.unarchive_city(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.archive_city_as_nonplace(uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unarchive_city(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_city_as_nonplace(uuid, text, jsonb) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.unarchive_city(uuid) TO service_role, authenticated;

-- Read-only candidate list. Nothing here is auto-archived and there is
-- deliberately NO cron: Luxembourg, Singapore, Monaco, Panama, Guatemala and
-- Kuwait are real cities whose names equal a country name. The
-- wikidata_link='data_unavailable' gate means the enrichment loop has already
-- tried and failed on every cleaned name variant (3 attempts) before a row can
-- even be proposed, and the zero-content requirement is re-checked inside the
-- archive function.
CREATE OR REPLACE VIEW public.cities_nonplace_candidates
WITH (security_invoker = on) AS
SELECT c.id, c.name, c.slug, c.data_source, c.shell_status, c.completeness_score,
       c.enrichment_status->'wikidata_link'->>'attempts' AS link_attempts,
       CASE
         WHEN c.name ~ '^[[:space:]—–-]*[Nn]/?[Aa][[:space:].]*$' THEN 'placeholder_name'
         WHEN c.name ~ '^\d'                                      THEN 'numeric_name'
         WHEN lower(c.name) IN (SELECT lower(name) FROM public.countries) THEN 'country_name'
         WHEN lower(c.name) IN (SELECT lower(name) FROM public.regions)   THEN 'region_name'
         ELSE 'unresolvable'
       END AS candidate_reason
FROM public.cities c
WHERE c.duplicate_of_id IS NULL
  AND coalesce(c.enrichment_status->'disposition'->>'state', '') <> 'not_a_city'
  AND coalesce(c.enrichment_status->'wikidata_link'->>'state', '') = 'data_unavailable'
  AND NOT EXISTS (SELECT 1 FROM public.venues v WHERE v.city_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM public.events e WHERE e.city_id = c.id)
  AND (
        c.name ~ '^[[:space:]—–-]*[Nn]/?[Aa][[:space:].]*$'
     OR c.name ~ '^\d'
     OR lower(c.name) IN (SELECT lower(name) FROM public.countries)
     OR lower(c.name) IN (SELECT lower(name) FROM public.regions)
  );

REVOKE ALL ON public.cities_nonplace_candidates FROM PUBLIC, anon;
GRANT SELECT ON public.cities_nonplace_candidates TO service_role, authenticated;
COMMENT ON VIEW public.cities_nonplace_candidates IS
  'Review list of cities rows that are not places. Human-reviewed only — never auto-archive: real cities share names with countries (Luxembourg, Singapore, Monaco, Panama).';
