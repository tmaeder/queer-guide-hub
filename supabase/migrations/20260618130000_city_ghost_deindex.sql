-- Reversible de-index of zero-content ghost cities.
--
-- 768 cities are shell_status='ghost' (seo_indexable AND zero venues/events) — empty
-- SEO-thin pages with no description and no content the factual backfill can ground.
-- Stop serving them to crawlers: set seo_indexable=false, snapshotting the prior value
-- into enrichment_status.ghost_deindex so it is fully reversible. When a ghost later
-- gains venues/events it flips to shell_status='real' and can be re-indexed.
--
-- Reverse:  UPDATE cities SET seo_indexable=true,
--             enrichment_status = enrichment_status - 'ghost_deindex'
--           WHERE (enrichment_status->'ghost_deindex'->>'prev_seo_indexable')='true';

DO $$
DECLARE v_count int;
BEGIN
  WITH targets AS (
    SELECT c.id
    FROM public.cities c
    WHERE c.duplicate_of_id IS NULL
      AND c.shell_status = 'ghost'
      AND c.seo_indexable = true
      AND NOT EXISTS (SELECT 1 FROM public.venues v WHERE v.city_id = c.id AND v.duplicate_of_id IS NULL)
      AND NOT EXISTS (SELECT 1 FROM public.events e WHERE e.city_id = c.id)
  )
  UPDATE public.cities c SET
    seo_indexable = false,
    enrichment_status = jsonb_set(coalesce(c.enrichment_status, '{}'::jsonb), ARRAY['ghost_deindex'],
      jsonb_build_object('prev_seo_indexable', true, 'reason', 'zero_content_ghost', 'at', now()), true)
  FROM targets t
  WHERE c.id = t.id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'ghost de-index: % cities', v_count;
END $$;
