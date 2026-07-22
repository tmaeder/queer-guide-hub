-- Queer-imagery backfill: work selector + daily top-up cron + admin automation.
--
-- The queer-imagery-backfill edge function re-images cities/countries (and
-- gap-fills events) with queer + place-connected photos. It records one
-- enrichment_log row per processed entity (step 'queer_image_backfill') as a
-- resumable cursor; this selector returns entities NOT yet logged, so hits and
-- misses both advance without any stamp-write to the entity table.

-- Fast NOT-EXISTS lookups against the growing log for this step.
CREATE INDEX IF NOT EXISTS idx_enrichment_log_queer_image
  ON public.enrichment_log (entity_type, entity_id)
  WHERE step = 'queer_image_backfill';

CREATE OR REPLACE FUNCTION public.entities_due_for_queer_image(
  p_entity_type text,
  p_limit int DEFAULT 40
)
RETURNS TABLE (
  id uuid,
  name text,
  country_name text,
  capital text,
  current_image_url text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_entity_type = 'city' THEN
    RETURN QUERY
      SELECT c.id, c.name, co.name AS country_name, NULL::text AS capital, c.image_url
      FROM cities c
      LEFT JOIN countries co ON co.id = c.country_id
      WHERE c.duplicate_of_id IS NULL
        AND c.name IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM enrichment_log el
          WHERE el.step = 'queer_image_backfill'
            AND el.entity_type = 'city'
            AND el.entity_id = c.id
        )
      -- Queer-relevance first: cities with venues or events, then by size.
      ORDER BY
        (EXISTS (SELECT 1 FROM venues v WHERE v.city_id = c.id)) DESC,
        (EXISTS (SELECT 1 FROM events e WHERE e.city_id = c.id)) DESC,
        c.population DESC NULLS LAST
      LIMIT GREATEST(1, LEAST(200, p_limit));

  ELSIF p_entity_type = 'country' THEN
    RETURN QUERY
      SELECT co.id, co.name, NULL::text AS country_name, co.capital, co.image_url
      FROM countries co
      WHERE co.duplicate_of_id IS NULL
        AND co.name IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM enrichment_log el
          WHERE el.step = 'queer_image_backfill'
            AND el.entity_type = 'country'
            AND el.entity_id = co.id
        )
      ORDER BY co.population DESC NULLS LAST
      LIMIT GREATEST(1, LEAST(200, p_limit));

  ELSIF p_entity_type = 'event' THEN
    -- Fill-empty only: never touch the 37k gaycities event photos.
    -- name=title, country_name=city, capital=event_type (see edge fn buildQueries).
    RETURN QUERY
      SELECT e.id, e.title, e.city AS country_name, COALESCE(e.event_type, '') AS capital, NULL::text
      FROM events e
      WHERE e.duplicate_of_id IS NULL
        AND e.title IS NOT NULL
        AND (e.images IS NULL OR array_length(e.images, 1) IS NULL OR array_length(e.images, 1) = 0)
        AND NOT EXISTS (
          SELECT 1 FROM enrichment_log el
          WHERE el.step = 'queer_image_backfill'
            AND el.entity_type = 'event'
            AND el.entity_id = e.id
        )
      ORDER BY e.start_date DESC NULLS LAST
      LIMIT GREATEST(1, LEAST(200, p_limit));
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.entities_due_for_queer_image(text, int) TO service_role;

-- Daily top-up for newly-added cities (bulk pass is the operator driver script).
DO $$ BEGIN
  PERFORM cron.unschedule('queer_image_backfill')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'queer_image_backfill');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'queer_image_backfill',
  '20 4 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/queer-imagery-backfill',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Webhook-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'image_quality_webhook_secret')
    ),
    body := '{"entity_type":"city","batch_size":40}'::jsonb,
    timeout_milliseconds := 120000
  ) AS request_id;
  $cron$
);

INSERT INTO admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES (
  'queer_image_backfill',
  'Queer imagery backfill',
  'Daily (04:20), re-image cities with queer + place-connected photos (Pexels/Unsplash/Wikimedia). Overwrites only on a qualifying hit; misses keep the existing image. Bulk cities/countries/events pass is run via scripts/data-quality/backfill-queer-imagery.mjs.',
  'system',
  true,
  '{"type": "schedule"}'::jsonb,
  '[]'::jsonb,
  '{"fn": "queer-imagery-backfill", "type": "edge"}'::jsonb,
  '20 4 * * *'
)
ON CONFLICT (slug) DO UPDATE
  SET name        = EXCLUDED.name,
      description = EXCLUDED.description,
      managed_by  = EXCLUDED.managed_by,
      trigger     = EXCLUDED.trigger,
      action      = EXCLUDED.action,
      schedule    = EXCLUDED.schedule,
      updated_at  = now();
