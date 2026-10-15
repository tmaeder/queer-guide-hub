-- A geography review can deliberately retain a safety hold while detaching an
-- unsupported country/city link. Such records are not under-gated: venues are
-- nonindexed and flagged for attention, and linked organizations are flagged
-- for attention. Keep the holds visible as a high-severity review backlog while
-- the critical gate continues to catch every other stored-vs-derived mismatch.
CREATE OR REPLACE FUNCTION public.release_gate_checks()
RETURNS TABLE(gate text, severity text, failures bigint, detail jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH review_holds AS (
    SELECT
      (SELECT count(*)::bigint FROM public.venues v
       WHERE v.duplicate_of_id IS NULL
         AND v.safety_gated IS TRUE
         AND v.country_id IS NULL AND v.city_id IS NULL
         AND v.needs_attention IS TRUE AND v.seo_indexable IS FALSE
         AND coalesce(v.category::text, '') <> 'cruising') AS venue_count,
      (SELECT count(*)::bigint FROM public.organizations o
       WHERE o.safety_gated IS TRUE
         AND o.country_id IS NULL AND o.city_id IS NULL
         AND o.needs_attention IS TRUE) AS organization_count
  ), raw AS (
    SELECT r.* FROM public.release_gate_checks_raw() r
  )
  SELECT r.gate, r.severity,
    CASE
      WHEN r.gate = 'news_category_coverage' THEN (
        SELECT count(*)::bigint FROM public.news_articles n
        WHERE n.duplicate_of_id IS NULL
          AND n.published_at > now() - interval '30 days'
          AND coalesce(n.category_canonical, 'general') = 'general'
          AND coalesce(n.enrichment_status->'category'->>'via', '') <> 'unmatched'
      )
      WHEN r.gate = 'city_safety_gate_drift' THEN
        CASE WHEN h.venue_count + h.organization_count > r.failures
          THEN h.venue_count + h.organization_count
          ELSE r.failures - h.venue_count - h.organization_count END
      ELSE r.failures
    END,
    CASE
      WHEN r.gate = 'news_category_coverage' THEN
        r.detail || jsonb_build_object('meaning', 'recent general rows without an explicit unmatched classification')
      WHEN r.gate = 'city_safety_gate_drift' THEN
        jsonb_set(
          jsonb_set(r.detail, '{venues}',
            to_jsonb(greatest((r.detail->>'venues')::bigint - h.venue_count, 0))),
          '{organizations}',
          to_jsonb(greatest((r.detail->>'organizations')::bigint - h.organization_count, 0)))
        || jsonb_build_object('review_holds', h.venue_count + h.organization_count)
      ELSE r.detail
    END
  FROM raw r CROSS JOIN review_holds h
  UNION ALL
  SELECT 'city_safety_review_holds', 'high',
    h.venue_count + h.organization_count,
    jsonb_build_object('venues', h.venue_count, 'organizations', h.organization_count,
                       'meaning', 'deliberately gated records with geography under review')
  FROM review_holds h;
$function$;
