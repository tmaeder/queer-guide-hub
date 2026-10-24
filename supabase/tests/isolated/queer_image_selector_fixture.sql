-- Original deployed selector captured on 2026-10-24; used only in disposable PG.
CREATE OR REPLACE FUNCTION public.entities_due_for_queer_image(p_entity_type text, p_limit integer DEFAULT 40)
 RETURNS TABLE(id uuid, name text, country_name text, capital text, current_image_url text, wiki_url text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_entity_type = 'city' THEN
    RETURN QUERY
      SELECT c.id, c.name, co.name AS country_name, NULL::text AS capital, c.image_url, NULL::text
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
      ORDER BY
        (EXISTS (SELECT 1 FROM venues v WHERE v.city_id = c.id)) DESC,
        (EXISTS (SELECT 1 FROM events e WHERE e.city_id = c.id)) DESC,
        c.population DESC NULLS LAST
      LIMIT GREATEST(1, LEAST(200, p_limit));

  ELSIF p_entity_type = 'country' THEN
    RETURN QUERY
      SELECT co.id, co.name, NULL::text AS country_name, co.capital, co.image_url, NULL::text
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
    RETURN QUERY
      SELECT e.id, e.title, e.city AS country_name, COALESCE(e.event_type, '') AS capital, NULL::text, NULL::text
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
    RETURN QUERY
      SELECT m.id, m.title,
        COALESCE(ci.name, m.city_name, co.name, m.country_name) AS country_name,
        extract(year FROM m.date)::int::text AS capital,
        m.image_url,
        (
          SELECT src.url FROM jsonb_to_recordset(m.sources) AS src(label text, url text)
          WHERE src.url ~ 'wikipedia\.org/wiki/' AND src.url !~ 'Timeline|List_of'
          LIMIT 1
        ) AS wiki_url
      FROM milestones m
      LEFT JOIN countries co ON co.id = m.country_id
      LEFT JOIN cities ci ON ci.id = m.city_id
      WHERE m.status = 'published'
        AND m.duplicate_of_id IS NULL
        AND (m.image_url IS NULL OR m.image_url LIKE '%/og/%')
        AND COALESCE(m.image_metadata->>'curated','') <> 'rejected'
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
$function$;

revoke all on function public.entities_due_for_queer_image(text,integer)from public,anon,authenticated;
grant execute on function public.entities_due_for_queer_image(text,integer)to service_role;
