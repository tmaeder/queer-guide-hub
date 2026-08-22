-- Marketplace quality governance: nightly snapshot + admin RPC + registry row.
-- See repo migration 20260916120500.
SET statement_timeout = '600s';

CREATE TABLE IF NOT EXISTS public.marketplace_quality_snapshots (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  taken_at timestamptz NOT NULL DEFAULT now(),
  stats jsonb NOT NULL
);
ALTER TABLE public.marketplace_quality_snapshots ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.run_marketplace_quality_snapshot()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_stats jsonb;
BEGIN
  WITH boiler AS (
    SELECT md5(lower(btrim(description))) AS h, count(*) AS n
    FROM public.marketplace_listings
    WHERE status = 'active' AND description IS NOT NULL AND btrim(description) <> ''
    GROUP BY 1 HAVING count(*) > 5
  ),
  l AS (
    SELECT
      count(*) AS active_total,
      count(*) FILTER (WHERE department = 'other') AS dept_other,
      count(*) FILTER (WHERE description IS NULL OR btrim(description) = '') AS no_description,
      count(*) FILTER (WHERE description IS NOT NULL AND length(btrim(description)) BETWEEN 1 AND 80) AS thin_description,
      count(*) FILTER (WHERE images IS NULL OR images = '{}') AS no_image,
      count(*) FILTER (WHERE merchant_id IS NULL) AS no_merchant_id,
      count(*) FILTER (WHERE lgbti_relevance_score = 0.6) AS relevance_default_06,
      count(*) FILTER (WHERE coalesce(lgbti_relevance_score, 0) < 0.6) AS relevance_below_gate,
      count(*) FILTER (WHERE link_checked_at IS NULL) AS link_never_checked,
      count(*) FILTER (WHERE tagged_at IS NOT NULL) AS tagged
    FROM public.marketplace_listings
    WHERE status = 'active'
  )
  SELECT jsonb_build_object(
    'active_total', l.active_total,
    'dept_other', l.dept_other,
    'no_description', l.no_description,
    'thin_description', l.thin_description,
    'boilerplate_rows', coalesce((SELECT sum(n) FROM boiler), 0),
    'boilerplate_groups', coalesce((SELECT count(*) FROM boiler), 0),
    'no_image', l.no_image,
    'no_merchant_id', l.no_merchant_id,
    'relevance_default_06', l.relevance_default_06,
    'relevance_below_gate', l.relevance_below_gate,
    'link_never_checked', l.link_never_checked,
    'tagged', l.tagged,
    'alt_text_missing', (
      SELECT count(*) FROM public.image_assets
      WHERE source = 'marketplace_pipeline' AND (alt_text IS NULL OR alt_text = '')
    ),
    'brands_pending', (SELECT count(*) FROM public.marketplace_brands WHERE status = 'pending'),
    'guide_picks', (SELECT count(*) FROM public.guide_picks WHERE entity_type = 'marketplace' AND NOT is_orphaned),
    'enhance_queue', (SELECT count(*) FROM public.marketplace_enhance_queue)
  ) INTO v_stats
  FROM l;

  INSERT INTO public.marketplace_quality_snapshots (stats) VALUES (v_stats);
  DELETE FROM public.marketplace_quality_snapshots WHERE taken_at < now() - interval '400 days';
  RETURN v_stats;
END;
$function$;

REVOKE ALL ON FUNCTION public.run_marketplace_quality_snapshot() FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.marketplace_quality_stats()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN public.has_role_jwt('admin') THEN jsonb_build_object(
    'latest', (SELECT jsonb_build_object('taken_at', taken_at, 'stats', stats)
               FROM public.marketplace_quality_snapshots ORDER BY taken_at DESC LIMIT 1),
    'previous', (SELECT jsonb_build_object('taken_at', taken_at, 'stats', stats)
                 FROM public.marketplace_quality_snapshots ORDER BY taken_at DESC OFFSET 1 LIMIT 1)
  ) ELSE NULL END;
$function$;

GRANT EXECUTE ON FUNCTION public.marketplace_quality_stats() TO authenticated;

INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, "trigger", action, schedule)
VALUES (
  'marketplace_quality_snapshot',
  'Marketplace quality snapshot',
  'Nightly snapshot of marketplace data-quality dimensions (department coverage, descriptions, images/alt text, relevance backlog, link health, brand queue) into marketplace_quality_snapshots.',
  'system', true, '{"type":"schedule"}'::jsonb,
  jsonb_build_object('type', 'cron', 'jobname', 'marketplace_quality_snapshot',
                     'command', 'SET statement_timeout = ''120s''; SELECT public.run_marketplace_quality_snapshot();'),
  '25 5 * * *'
)
ON CONFLICT (slug) DO NOTHING;

SELECT public.sync_automations_to_cron(true);

SELECT public.run_marketplace_quality_snapshot();
