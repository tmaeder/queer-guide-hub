-- Marketplace quality ops. See repo migration 20260916120400 for full
-- rationale (prune generalization + freshness guard, brand triage,
-- feed-sync liveness credit, enhance queue, department shortlist guides,
-- automation throughput).
SET statement_timeout = '900s';
SET lock_timeout = '5s';

DROP FUNCTION IF EXISTS public.marketplace_prune_candidates(text[], numeric, integer);

CREATE FUNCTION public.marketplace_prune_candidates(
  p_domains text[] DEFAULT NULL,
  p_max_relevance numeric DEFAULT 0.60,
  p_limit integer DEFAULT NULL,
  p_max_age interval DEFAULT interval '45 days'
)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE
AS $function$
  SELECT l.id
  FROM public.marketplace_listings l
  WHERE l.status = 'active'
    AND (p_domains IS NULL OR l.merchant_domain = ANY (p_domains))
    AND coalesce(l.lgbti_relevance_score, 0) < p_max_relevance
    AND l.classified_at IS NOT NULL
    AND l.classified_at > now() - p_max_age
    AND l.featured = false
    AND NOT EXISTS (
      SELECT 1 FROM public.marketplace_brands b
      WHERE b.brand_key = public.marketplace_normalize_brand(l.brand)
        AND b.status = 'approved' AND b.ownership_tags <> '{}'
    )
    AND NOT EXISTS (SELECT 1 FROM public.wishlist_items w WHERE w.listing_id = l.id)
    AND NOT EXISTS (SELECT 1 FROM public.marketplace_favorites f WHERE f.listing_id = l.id)
  ORDER BY coalesce(l.lgbti_relevance_score, 0) ASC
  LIMIT coalesce(p_limit, 2147483647);
$function$;

REVOKE ALL ON FUNCTION public.marketplace_prune_candidates(text[], numeric, integer, interval) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.run_marketplace_catalog_prune(p_batch integer DEFAULT 300, p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_automation_id uuid; v_run_id bigint; v_enabled boolean;
  v_started timestamptz := now(); v_archived int := 0; v_remaining int;
  v_reason text := 'prune_low_relevance_2026_08';
BEGIN
  SELECT id, enabled INTO v_automation_id, v_enabled
  FROM public.admin_automations WHERE slug = 'marketplace_catalog_prune';

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  VALUES (v_automation_id, 'marketplace_catalog_prune', v_started, 'success', 0, 0)
  RETURNING id INTO v_run_id;

  IF (v_enabled IS DISTINCT FROM true) AND NOT p_force THEN
    UPDATE public.admin_automation_runs SET finished_at=now(),
      summary=jsonb_build_object('skipped',true,'reason','paused') WHERE id=v_run_id;
    UPDATE public.admin_automations SET last_run_at=v_started, last_run_status='paused' WHERE id=v_automation_id;
    RETURN jsonb_build_object('skipped',true,'reason','paused');
  END IF;

  UPDATE public.marketplace_listings l
    SET status = 'inactive', archived_reason = v_reason, archived_at = now()
  WHERE l.id IN (SELECT public.marketplace_prune_candidates(
    NULL, 0.60, GREATEST(1, LEAST(p_batch, 1000))));
  GET DIAGNOSTICS v_archived = ROW_COUNT;

  SELECT count(*) INTO v_remaining
  FROM public.marketplace_prune_candidates(NULL, 0.60, NULL);

  UPDATE public.admin_automation_runs SET finished_at=now(),
    items_examined=v_archived+v_remaining, items_changed=v_archived,
    summary=jsonb_build_object('archived',v_archived,'remaining',v_remaining,'reason',v_reason) WHERE id=v_run_id;
  UPDATE public.admin_automations SET last_run_at=v_started, last_run_status='success' WHERE id=v_automation_id;
  RETURN jsonb_build_object('archived', v_archived, 'remaining', v_remaining, 'reason', v_reason);
END; $function$;

CREATE OR REPLACE FUNCTION public.marketplace_prune_stats()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN public.has_role_jwt('admin') THEN jsonb_build_object(
    'archived_by_reason', coalesce((
      SELECT jsonb_object_agg(archived_reason, n)
      FROM (SELECT archived_reason, count(*) AS n
            FROM public.marketplace_listings
            WHERE archived_reason IS NOT NULL
            GROUP BY archived_reason) x), '{}'::jsonb),
    'remaining_candidates', (SELECT count(*) FROM public.marketplace_prune_candidates(NULL, 0.60, NULL)),
    'active_total', (SELECT count(*) FROM public.marketplace_listings WHERE status = 'active')
  ) ELSE NULL END;
$function$;

WITH pend AS (
  SELECT b.id,
    (SELECT count(*) FROM public.marketplace_listings ml
      WHERE ml.brand_key = b.brand_key AND ml.status = 'active') AS live,
    (SELECT count(*) FROM public.marketplace_listings ml
      WHERE ml.brand_key = b.brand_key AND ml.status = 'active' AND ml.department = 'books_art') AS books
  FROM public.marketplace_brands b
  WHERE b.status = 'pending'
)
UPDATE public.marketplace_brands b
SET status = CASE WHEN p.live >= 3 AND p.books::numeric / p.live <= 0.8 THEN 'approved' ELSE 'rejected' END,
    reviewer_note = CASE
      WHEN p.live >= 3 AND p.books::numeric / p.live <= 0.8
        THEN 'auto 2026-08-22 DQ pass: merch brand with 3+ live listings — approved for brand page only, no ownership claim'
      ELSE 'auto 2026-08-22 DQ pass: book author / not a merch brand (listings are books_art)'
    END,
    reviewed_at = now()
FROM pend p
WHERE b.id = p.id
  AND coalesce(b.ownership_tags, '{}') = '{}'
  AND (
    (p.live >= 3 AND p.books::numeric / p.live <= 0.8)
    OR (p.live > 0 AND p.books::numeric / p.live > 0.8)
  );

SET session_replication_role = replica;
UPDATE public.marketplace_listings
SET link_health = 'ok', link_checked_at = last_seen_at
WHERE status = 'active'
  AND link_checked_at IS NULL
  AND last_seen_at > now() - interval '14 days';
SET session_replication_role = DEFAULT;

CREATE TABLE IF NOT EXISTS public.marketplace_enhance_queue (
  listing_id uuid PRIMARY KEY REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
  priority smallint NOT NULL,
  enqueued_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.marketplace_enhance_queue ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.marketplace_enhance_refill(p_max integer DEFAULT 5000)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_n integer;
BEGIN
  WITH boiler AS (
    SELECT md5(lower(btrim(description))) AS h
    FROM public.marketplace_listings
    WHERE status = 'active' AND description IS NOT NULL AND btrim(description) <> ''
    GROUP BY 1 HAVING count(*) > 5
  ),
  cand AS (
    SELECT ml.id,
      CASE
        WHEN md5(lower(btrim(ml.description))) IN (SELECT h FROM boiler) THEN 1
        WHEN length(btrim(ml.description)) < 80 THEN 2
        ELSE 3
      END AS priority
    FROM public.marketplace_listings ml
    WHERE ml.status = 'active'
      AND ml.description IS NOT NULL AND length(btrim(ml.description)) > 20
      AND (ml.description_i18n IS NULL OR NOT (ml.description_i18n ? '_enhanced_at'))
    ORDER BY 2, ml.updated_at
    LIMIT p_max
  )
  INSERT INTO public.marketplace_enhance_queue (listing_id, priority)
  SELECT id, priority FROM cand
  ON CONFLICT (listing_id) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$function$;

CREATE OR REPLACE FUNCTION public.marketplace_enhance_claim(p_limit integer DEFAULT 30)
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (SELECT count(*) FROM public.marketplace_enhance_queue) = 0 THEN
    PERFORM public.marketplace_enhance_refill(5000);
  END IF;
  RETURN QUERY
  WITH pick AS (
    SELECT listing_id FROM public.marketplace_enhance_queue
    ORDER BY priority, enqueued_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.marketplace_enhance_queue q
  USING pick WHERE q.listing_id = pick.listing_id
  RETURNING q.listing_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.marketplace_enhance_refill(integer) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.marketplace_enhance_claim(integer) FROM anon, authenticated;

WITH depts(dept, title, slug) AS (
  VALUES
    ('apparel',   'Apparel shortlist',      'shop-apparel-shortlist'),
    ('underwear', 'Underwear shortlist',    'shop-underwear-shortlist'),
    ('swimwear',  'Swimwear shortlist',     'shop-swimwear-shortlist'),
    ('jewelry',   'Jewelry shortlist',      'shop-jewelry-shortlist'),
    ('books_art', 'Books & art shortlist',  'shop-books-art-shortlist'),
    ('home',      'Home & living shortlist','shop-home-living-shortlist'),
    ('hygiene',   'Hygiene & care shortlist','shop-hygiene-care-shortlist')
),
ins AS (
  INSERT INTO public.guides (format, slug, title, dek, category, primary_entity_type, status, audience_tags, criteria, pick_count, is_featured, safety_gated, meta)
  SELECT 'list', d.slug, d.title,
         'Standout ' || lower(replace(d.title, ' shortlist','')) || ' from queer-owned and community shops.',
         'shopping', 'marketplace', 'review', '{}', '{}'::jsonb, 0, false, false,
         jsonb_build_object('generated_by', 'marketplace-dq-2026-08-22', 'department', d.dept)
  FROM depts d
  WHERE NOT EXISTS (SELECT 1 FROM public.guides g WHERE g.slug = d.slug)
  RETURNING id, (meta->>'department') AS dept
)
INSERT INTO public.guide_picks (guide_id, entity_type, entity_id, position, pros, cons)
SELECT i.id, 'marketplace', pick.id, pick.rn, '{}', '{}'
FROM ins i
JOIN LATERAL (
  SELECT ml.id, row_number() OVER (ORDER BY ml.boutique_score DESC NULLS LAST) AS rn
  FROM public.marketplace_listings ml
  WHERE ml.status = 'active' AND ml.department = i.dept
    AND coalesce(ml.content_rating, 'sfw') IN ('sfw', 'suggestive')
    AND ml.images IS NOT NULL AND ml.images <> '{}'
  ORDER BY ml.boutique_score DESC NULLS LAST
  LIMIT 12
) pick ON true;

UPDATE public.admin_automations
SET schedule = '20 2 * * *'
WHERE slug = 'marketplace_relevance_rescore_weekly';

SELECT cron.alter_job(jobid, schedule => '20 2 * * *')
FROM cron.job WHERE jobname = 'marketplace_relevance_rescore_weekly';

UPDATE public.admin_automations
SET action = jsonb_set(action, '{command}', to_jsonb(replace(
      action->>'command',
      '''{"merchant_domain":"ohmyfantasy.com","batch_size":30}''',
      '''{"batch_size":30}''')))
WHERE slug = 'marketplace_description_enhance'
  AND action->>'command' LIKE '%ohmyfantasy%';

UPDATE public.admin_automations
SET action = jsonb_set(action, '{command}', to_jsonb(replace(
      action->>'command',
      '{"batch_size":200,"stale_days":30}',
      '{"batch_size":400,"stale_days":30}')))
WHERE slug = 'marketplace_link_checker'
  AND action->>'command' LIKE '%"batch_size":200%';

SELECT public.sync_automations_to_cron(true);
