-- Phase 3 of the personalities content-quality remediation
-- (docs/plans/2026-06-07-personalities-content-quality-design.md).
--
-- The approved plan called for "LLM agentic-enrich for the Wikidata-absent". The
-- data forced a narrower, safer design: the Wikidata-absent residue is ~94% bare
-- names (no url, bio, socials, ids) — and a meaningful share are not people at
-- all but organizations / venues / teams misfiled into personalities. Running a
-- web-research LLM over bare names would fabricate identity claims about
-- possibly-private people (the platform's core harm). So Phase 3 is split:
--
--   3a (safe LLM extraction): the personality-extract-from-bio edge function
--       pulls FACTUAL fields (birth/death year, profession, nationality) STRICTLY
--       from a row's own existing bio (grounded, never invented; never the
--       sensitive lgbti_connection), fills only blanks, writes a 'self-bio'
--       provenance row, and re-queues the row so the Wikidata resolver gets a
--       second pass with new disambiguators. Daily cron below.
--
--   3b (honest triage): rows that are a bare name with no grounding are marked
--       enrichment_status.triage = 'insufficient_data' (a one-shot data backfill,
--       not in this migration) so the admin surface can show them as a distinct
--       "needs human review / likely non-person" bucket instead of being
--       silently auto-enriched. Reproduce with:
--
--         UPDATE public.personalities
--            SET enrichment_status = coalesce(enrichment_status,'{}'::jsonb)
--                || jsonb_build_object('triage','insufficient_data','triage_at',now()::text)
--          WHERE duplicate_of_id IS NULL AND review_status <> 'archived'
--            AND wikidata_qid IS NULL
--            AND website_url IS NULL AND profile_url IS NULL
--            AND (bio IS NULL OR length(trim(bio)) < 120)
--            AND (social_links IS NULL OR social_links = '{}'::jsonb)
--            AND (external_ids IS NULL OR external_ids = '{}'::jsonb)
--            AND birth_date IS NULL AND profession IS NULL AND nationality IS NULL
--            AND NOT (enrichment_status ? 'triage');

-- 3a continuous: drain the small set of bio-bearing-but-thin rows daily.
SELECT cron.unschedule('personality-extract-from-bio')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'personality-extract-from-bio');

SELECT cron.schedule(
  'personality-extract-from-bio',
  '15 4 * * *',
  $cron$SELECT net.http_post(
      url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/personality-extract-from-bio',
      headers := '{"Content-Type":"application/json","x-webhook-secret":"meilisearch-sync-webhook-2026"}'::jsonb,
      body := '{"batch_size":20}'::jsonb
    );$cron$
);
