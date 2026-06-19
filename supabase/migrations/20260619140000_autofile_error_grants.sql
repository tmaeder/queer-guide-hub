-- Auto-filed client errors: allow the browser (anon + authenticated) to call
-- upsert_api_error so uncaught errors / 404s land in community_submissions as
-- content_type='api_error'. The function is SECURITY DEFINER and only ever
-- writes api_error rows (no arbitrary insert), and it dedups by fingerprint —
-- the INSERT trigger then LLM-triages each new fingerprint, and the existing
-- auto-dedup + stale-error GC crons absorb volume. The grant is the only thing
-- missing for the client to reach it; everything else already exists.

GRANT EXECUTE ON FUNCTION public.upsert_api_error(text, jsonb, text) TO anon, authenticated;
