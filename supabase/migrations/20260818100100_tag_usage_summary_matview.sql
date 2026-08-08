-- tag_usage_summary was a plain view aggregating ALL unified_tag_assignments
-- per call (214 ms x 43k calls since 2026-05-03; useTagUsageCounts fetches the
-- whole 9k-row result on every visit with only a 5-min client cache). Counts
-- are cosmetic, so it becomes a materialized view refreshed hourly. Same name,
-- same columns — PostgREST callers are untouched.
-- Idempotent: guarded drop (relkind check), IF NOT EXISTS everywhere, so the
-- file re-applies cleanly after a raw pre-apply.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'tag_usage_summary' AND c.relkind = 'v'
  ) THEN
    DROP VIEW public.tag_usage_summary;
  END IF;
END $$;

CREATE MATERIALIZED VIEW IF NOT EXISTS public.tag_usage_summary AS
 SELECT ut.id,
    ut.name,
    ut.slug,
    ut.category,
    ut.usage_count,
    count(CASE WHEN uta.entity_type = 'event'::text THEN 1 ELSE NULL::integer END) AS event_count,
    count(CASE WHEN uta.entity_type = 'venue'::text THEN 1 ELSE NULL::integer END) AS venue_count,
    count(CASE WHEN uta.entity_type = 'marketplace_listing'::text THEN 1 ELSE NULL::integer END) AS marketplace_count,
    count(CASE WHEN uta.entity_type = 'content'::text THEN 1 ELSE NULL::integer END) AS content_count,
    count(CASE WHEN uta.entity_type = 'news_article'::text THEN 1 ELSE NULL::integer END) AS news_count,
    count(CASE WHEN uta.entity_type = 'community_post'::text THEN 1 ELSE NULL::integer END) AS post_count,
    count(CASE WHEN uta.entity_type = 'community_group'::text THEN 1 ELSE NULL::integer END) AS group_count
   FROM unified_tags ut
     LEFT JOIN unified_tag_assignments uta ON ut.id = uta.tag_id
  GROUP BY ut.id, ut.name, ut.slug, ut.category, ut.usage_count
  ORDER BY ut.usage_count DESC;

-- Required for REFRESH ... CONCURRENTLY (readers never block).
CREATE UNIQUE INDEX IF NOT EXISTS tag_usage_summary_id_key
  ON public.tag_usage_summary (id);

-- Matviews do not inherit the view's grants; this project requires explicit
-- anon grants on new relations.
GRANT SELECT ON public.tag_usage_summary TO anon, authenticated, service_role;

-- Hourly refresh, registered in admin_automations in the same migration
-- (registry-of-record contract: a cron with no registry row fails
-- pipeline-health; a disabled row gets unscheduled by the nightly reconciler,
-- so enabled must be true).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'tag_usage_summary_refresh') THEN
    PERFORM cron.schedule(
      'tag_usage_summary_refresh',
      '25 * * * *',
      'REFRESH MATERIALIZED VIEW CONCURRENTLY public.tag_usage_summary;'
    );
  END IF;
END $$;

INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES (
  'tag_usage_summary_refresh',
  'Tag usage summary refresh',
  'Hourly refresh of the tag_usage_summary materialized view (was a plain view recomputed on every read).',
  'user',
  true,
  '{"type": "schedule"}'::jsonb,
  '{}'::jsonb,
  jsonb_build_object(
    'type', 'cron',
    'jobname', 'tag_usage_summary_refresh',
    'command', 'REFRESH MATERIALIZED VIEW CONCURRENTLY public.tag_usage_summary;'
  ),
  '25 * * * *'
)
ON CONFLICT (slug) DO NOTHING;
