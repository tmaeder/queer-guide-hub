-- marketplace-variant-backfill scaffolding (finer-categorisation program, PR 3):
-- work-list selector + cron registration, plus the LAST category-keyed
-- attribute-vocab read re-keyed onto slug prefixes.
--
-- Throughput: 300 listings per 5-minute fire ≈ 3.6k/h — the 69.7k historical
-- backfill drains in ~20h; per-row listing UPDATEs enqueue search reindexes at
-- ≤300/5min, far inside the drain's measured capacity. Steady state the
-- work-list empties (attributes_extracted_at stamped on every visit, re-due
-- only when a source payload is re-seen) and fires become no-ops.

-- ── 1. Work-list selector ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.marketplace_due_for_variant_extract(p_limit integer DEFAULT 300)
RETURNS TABLE(id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT l.id
  FROM public.marketplace_listings l
  WHERE l.status = 'active'
    AND (
      l.attributes_extracted_at IS NULL
      OR EXISTS (
        SELECT 1 FROM public.marketplace_listing_sources s
        WHERE s.listing_id = l.id AND s.last_seen_at > l.attributes_extracted_at)
    )
  ORDER BY l.attributes_extracted_at ASC NULLS FIRST, l.updated_at ASC
  LIMIT GREATEST(1, LEAST(p_limit, 300));
$$;
REVOKE ALL ON FUNCTION public.marketplace_due_for_variant_extract(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marketplace_due_for_variant_extract(integer) TO service_role, authenticated;

-- ── 2. Re-key marketplace_due_for_tagging (live-bug repair) ──────────────────
-- Its has_attributes EXISTS matched t.category IN ('material','occasion','vibe'),
-- which matches ZERO rows since the tag-category consolidation rewrote category
-- text — the "attributes-first" ordering signal has been dead (tagged_at
-- round-robin kept the sweep alive). Same signature; prefix-keyed.
CREATE OR REPLACE FUNCTION public.marketplace_due_for_tagging(p_limit integer DEFAULT 150)
 RETURNS TABLE(id uuid, title text, description text, brand text, subcategory text, subcategory_slug text, content_rating text, community_owned_tags text[], lgbti_relevance_score numeric, has_attributes boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT l.id, l.title, l.description, l.brand, l.subcategory, l.subcategory_slug,
         l.content_rating, l.community_owned_tags, l.lgbti_relevance_score,
         EXISTS (SELECT 1 FROM public.unified_tag_assignments a JOIN public.unified_tags t ON t.id=a.tag_id
                 WHERE a.entity_type='marketplace_listing' AND a.entity_id=l.id AND t.slug ~ '^(mat|occ|vibe)-') AS has_attributes
  FROM public.marketplace_listings l
  WHERE l.status='active'
  ORDER BY
    (l.tagged_at IS NOT NULL),
    EXISTS (SELECT 1 FROM public.unified_tag_assignments a JOIN public.unified_tags t ON t.id=a.tag_id
            WHERE a.entity_type='marketplace_listing' AND a.entity_id=l.id AND t.slug ~ '^(mat|occ|vibe)-'),
    l.tagged_at ASC NULLS FIRST, l.updated_at ASC
  LIMIT GREATEST(1, LEAST(p_limit, 500));
$function$;

-- ── 3. Registry row (canonical, RAW command — sync_automations_to_cron()
--       derives the run-tracking wrapper; do NOT pre-wrap, see 20260910163700) ─
INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES (
  'marketplace_variant_backfill',
  'Marketplace variant + attribute extract',
  'Every 5 min: marketplace-variant-backfill extracts per-variant size/colour/price/stock from marketplace_listing_sources.raw (Shopify options/variants, Etsy inventory, feed colour/condition), rolls up marketplace_listings.attributes, mirrors color-*/size-*/genre-*/fit-* tags and exact-match merchant-tag concepts. Free extraction, NO LLM. Batch 300 = search-trigger cap; historical 69.7k backlog drains in ~20h then fires become no-ops. Kill switch = disable this row.',
  'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
  jsonb_build_object('type','cron','jobname','marketplace-variant-backfill','command',
$$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/marketplace-variant-backfill',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'X-Webhook-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='marketplace_tag_webhook_secret')
    ),
    body := '{"batch_limit":300}'::jsonb,
    timeout_milliseconds := 180000
  );
$$),
  '*/5 * * * *'
)
ON CONFLICT (slug) DO UPDATE
  SET name        = EXCLUDED.name,
      description = EXCLUDED.description,
      schedule    = EXCLUDED.schedule,
      action      = EXCLUDED.action,
      enabled     = EXCLUDED.enabled;

DO $$
BEGIN
  BEGIN
    PERFORM cron.unschedule('marketplace-variant-backfill');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;

SELECT cron.schedule(a.action->>'jobname', a.schedule, a.action->>'command')
FROM public.admin_automations a
WHERE a.slug = 'marketplace_variant_backfill';
