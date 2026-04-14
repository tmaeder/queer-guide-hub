-- Ingestion sources cleanup:
--  1. Register TomTom as a first-class ingestion source (matches source-tomtom edge function).
--  2. Retire Foursquare and Google Places from the "Missing/Error" surface until fresh keys land.
--
-- The admin UI filters manage-api-keys?action=status on is_enabled=true, so disabled sources
-- no longer show up as noisy "Missing" entries on /admin/api-keys.

INSERT INTO public.ingestion_sources (
  name, slug, source_type, target_table, edge_function, config, schedule, is_enabled, requires_api_key
)
VALUES (
  'TomTom Places',
  'tomtom',
  'api',
  'venues',
  'source-tomtom',
  '{"cities":["Zurich","Berlin","Amsterdam","Paris","London","Madrid"]}'::jsonb,
  NULL,
  true,
  'TOMTOM_API_KEY'
)
ON CONFLICT (slug) DO UPDATE
  SET edge_function = EXCLUDED.edge_function,
      requires_api_key = EXCLUDED.requires_api_key,
      config = EXCLUDED.config,
      is_enabled = EXCLUDED.is_enabled,
      updated_at = now();

-- Foursquare key expired (401), no replacement available. Clear the requires_api_key
-- pointer so the admin UI stops flagging it as "Missing", and disable the source so
-- automation does not pick it up. Re-enable once a working key is added.
UPDATE public.ingestion_sources
SET is_enabled = false,
    requires_api_key = NULL,
    updated_at = now()
WHERE slug IN ('foursquare', 'google-places');
