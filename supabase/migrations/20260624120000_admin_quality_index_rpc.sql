-- Admin cockpit quality index — server-side aggregation.
--
-- Replaces a client-side full-table scan: the dashboard hook (useAdminCockpit)
-- used to `SELECT quality_score, needs_attention` with NO limit across venues,
-- events, personalities and news_articles (potentially 100k+ rows) on every
-- load and every 60s refetch, then average in JS. This RPC computes the same
-- numbers in SQL in a single round-trip.
--
-- Semantics mirror the previous JS exactly so dashboard figures don't shift:
--   byContentType[type] = { total, withIssues, score=round(avg(quality_score)) }
--   warnings  = Σ withIssues over types where 1 ≤ withIssues ≤ 10
--   critical  = Σ withIssues over types where withIssues > 10
--   overallScore = round(Σ quality_score / Σ scored-rows) across all 4 tables
--
-- Grants mirror the sibling admin RPC get_admin_counts (SECURITY DEFINER,
-- EXECUTE to authenticated + service_role); the admin routes are role-gated
-- client-side and the data (aggregate quality scores/counts) is not sensitive.

CREATE OR REPLACE FUNCTION public.get_admin_quality_index()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH stats AS (
    SELECT 'venues'::text AS type,
      count(*) AS total,
      count(*) FILTER (WHERE needs_attention IS TRUE) AS with_issues,
      coalesce(round(avg(quality_score) FILTER (WHERE quality_score IS NOT NULL)), 0)::int AS score,
      coalesce(sum(quality_score) FILTER (WHERE quality_score IS NOT NULL), 0)::numeric AS score_sum,
      count(*) FILTER (WHERE quality_score IS NOT NULL) AS scored
    FROM venues
    UNION ALL
    SELECT 'events',
      count(*),
      count(*) FILTER (WHERE needs_attention IS TRUE),
      coalesce(round(avg(quality_score) FILTER (WHERE quality_score IS NOT NULL)), 0)::int,
      coalesce(sum(quality_score) FILTER (WHERE quality_score IS NOT NULL), 0)::numeric,
      count(*) FILTER (WHERE quality_score IS NOT NULL)
    FROM events
    UNION ALL
    SELECT 'personalities',
      count(*),
      count(*) FILTER (WHERE needs_attention IS TRUE),
      coalesce(round(avg(quality_score) FILTER (WHERE quality_score IS NOT NULL)), 0)::int,
      coalesce(sum(quality_score) FILTER (WHERE quality_score IS NOT NULL), 0)::numeric,
      count(*) FILTER (WHERE quality_score IS NOT NULL)
    FROM personalities
    UNION ALL
    SELECT 'news_articles',
      count(*),
      count(*) FILTER (WHERE needs_attention IS TRUE),
      coalesce(round(avg(quality_score) FILTER (WHERE quality_score IS NOT NULL)), 0)::int,
      coalesce(sum(quality_score) FILTER (WHERE quality_score IS NOT NULL), 0)::numeric,
      count(*) FILTER (WHERE quality_score IS NOT NULL)
    FROM news_articles
  )
  SELECT jsonb_build_object(
    'overallScore',
      CASE WHEN sum(scored) > 0 THEN round(sum(score_sum) / sum(scored))::int ELSE 0 END,
    'byContentType',
      jsonb_object_agg(type, jsonb_build_object(
        'total', total,
        'withIssues', with_issues,
        'score', score
      )),
    'warnings',
      coalesce(sum(with_issues) FILTER (WHERE with_issues > 0 AND with_issues <= 10), 0),
    'critical',
      coalesce(sum(with_issues) FILTER (WHERE with_issues > 10), 0)
  )
  FROM stats;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_admin_quality_index() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_quality_index() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_quality_index() TO service_role;
