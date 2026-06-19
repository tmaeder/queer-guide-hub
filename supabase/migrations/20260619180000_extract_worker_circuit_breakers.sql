-- Circuit breakers for the self-hosted deepcrawl extract worker (workers/extract).
-- `deepcrawl_extract` guards the static fetch+clean path (called by
-- pipeline-extract-fulltext and, later, source-crawl-seed + the submit worker).
-- `cf_browser_render` guards the Phase-4 Browser Rendering path separately so a
-- SPA-render exhaustion degrades to static-only without tripping full-text extract.
--
-- On trip, extract-client.ts returns null and callers fall back to the local
-- readability-lite path, so a worker outage never blanks content.

INSERT INTO public.api_circuit_breakers (api_name, state, threshold, reset_timeout_seconds)
VALUES
  ('deepcrawl_extract', 'closed', 5, 300),
  ('cf_browser_render', 'closed', 5, 600)
ON CONFLICT (api_name) DO UPDATE
  SET threshold = EXCLUDED.threshold,
      reset_timeout_seconds = EXCLUDED.reset_timeout_seconds,
      updated_at = now();
