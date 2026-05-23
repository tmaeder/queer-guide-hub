-- D10 backfill — re-derive events.country_id from cities.country_id when they
-- disagree. Trusts the city's country (city is anchored to coords + population).
--
-- Symptom row: BOITOI "GERMANY" Launch Show — city='Salford' resolves to UK,
-- but events.country='US' (from upstream feed) so country_id was set to US.
--
-- Run in two passes. The first SELECT shows what would change. Comment out the
-- preview and uncomment the UPDATE when you've reviewed.
--
-- Via Supabase MCP:
--   mcp__supabase__execute_sql(project_id=..., query=<this-file>)
-- Or:
--   psql "$DATABASE_URL" -f scripts/recompute-event-countries.sql

-- ===========================================================
-- PASS 1: preview (no writes)
-- ===========================================================
SELECT
  e.id,
  e.slug,
  e.title,
  e.city,
  e.country                  AS event_country_text,
  ec.name                    AS event_country_name,
  c.name                     AS city_name,
  cc.name                    AS city_country_name,
  c.country_id               AS new_country_id
FROM public.events e
JOIN public.cities c        ON c.id = e.city_id
JOIN public.countries cc    ON cc.id = c.country_id
LEFT JOIN public.countries ec ON ec.id = e.country_id
WHERE e.city_id IS NOT NULL
  AND c.country_id IS NOT NULL
  AND e.country_id IS DISTINCT FROM c.country_id
ORDER BY e.created_at DESC
LIMIT 200;

-- ===========================================================
-- PASS 2: apply — uncomment after reviewing.
-- ===========================================================
-- UPDATE public.events e
-- SET country_id = c.country_id,
--     country    = cc.code,
--     updated_at = now()
-- FROM public.cities c
-- JOIN public.countries cc ON cc.id = c.country_id
-- WHERE e.city_id = c.id
--   AND c.country_id IS NOT NULL
--   AND e.country_id IS DISTINCT FROM c.country_id;
