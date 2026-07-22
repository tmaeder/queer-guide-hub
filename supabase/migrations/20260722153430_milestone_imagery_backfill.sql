-- Milestone imagery: real archival photos for the /history timeline.
--
-- 1. milestones.image_metadata jsonb — attribution/license/score/source for the
--    displayed photo (mirrors the cities/countries convention). image_url alone
--    can't carry CC BY-SA attribution, which the detail page must render.
-- 2. entities_due_for_queer_image gains a 'milestone' branch so the existing
--    queer-imagery-backfill edge fn + driver can process milestones with the
--    same enrichment_log cursor. Persecution/negative milestones are EXCLUDED —
--    auto-picked archival imagery on persecution content risks real harm; those
--    keep the typographic card until a human curates an image.
--    Slot mapping (DueRow is fixed at 4 fields): name=title,
--    country_name=most-specific place label, capital=year (for query building).

alter table public.milestones add column if not exists image_metadata jsonb;

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

  ELSIF p_entity_type = 'milestone' THEN
    -- Published queer-history milestones without a real display photo (the
    -- /og/ text-card URLs are meta art, filtered out of display). Persecution
    -- and negative-impact rows are excluded by design — human curation only.
    -- name=title, country_name=most-specific place, capital=year.
    RETURN QUERY
      SELECT m.id, m.title,
        COALESCE(ci.name, m.city_name, co.name, m.country_name) AS country_name,
        extract(year FROM m.date)::int::text AS capital,
        m.image_url
      FROM milestones m
      LEFT JOIN countries co ON co.id = m.country_id
      LEFT JOIN cities ci ON ci.id = m.city_id
      WHERE m.status = 'published'
        AND m.duplicate_of_id IS NULL
        AND (m.image_url IS NULL OR m.image_url LIKE '%/og/%')
        AND COALESCE(m.category, '') <> 'persecution-destruction'
        AND m.impact <> 'negative'
        AND NOT EXISTS (
          SELECT 1 FROM enrichment_log el
          WHERE el.step = 'queer_image_backfill'
            AND el.entity_type = 'milestone'
            AND el.entity_id = m.id
        )
      ORDER BY m.significance DESC, m.date ASC
      LIMIT GREATEST(1, LEAST(200, p_limit));
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.entities_due_for_queer_image(text, int) TO service_role;
