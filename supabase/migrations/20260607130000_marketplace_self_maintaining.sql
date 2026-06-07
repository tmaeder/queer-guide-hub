-- Phase 5: self-maintaining marketplace (design 2026-06-07).
-- Selector mirrors venues_due_for_refresh: never-verified > broken > stale > low-quality.
CREATE OR REPLACE FUNCTION public.marketplace_listings_due_for_refresh(p_limit integer DEFAULT 200)
RETURNS TABLE (id uuid, title text, external_url text, source_type text,
               link_health text, quality_score integer, last_verified_at timestamptz)
LANGUAGE sql STABLE AS $$
  SELECT id, title, external_url, source_type, link_health, quality_score, last_verified_at
  FROM marketplace_listings
  WHERE status = 'active' AND external_url IS NOT NULL
  ORDER BY
    (last_verified_at IS NOT NULL),                 -- never-verified first
    (link_health <> 'broken') NULLS FIRST,          -- broken next
    quality_score ASC NULLS FIRST,                  -- weakest next
    last_verified_at ASC NULLS FIRST                 -- stalest next
  LIMIT GREATEST(1, p_limit)
$$;

-- Recurring LLM/enrichment passes. Mostly no-op until ingestion resumes (Phase 4);
-- wiring them now makes the pipeline self-maintaining for new items. Edge invocation
-- via net.http_post + anon Bearer (same pattern as enrich-venue-images).
DO $cron$
DECLARE
  v_auth text := 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8';
  v_base text := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/';
BEGIN
  PERFORM cron.schedule('marketplace_enrich_weekly', '0 2 * * 3', format($$
    SELECT net.http_post(url := %L, headers := jsonb_build_object('Content-Type','application/json','Authorization',%L), body := jsonb_build_object('batch_size',60));
  $$, v_base||'marketplace-enrich', v_auth));

  PERFORM cron.schedule('marketplace_relevance_rescore_weekly', '20 2 * * 3', format($$
    SELECT net.http_post(url := %L, headers := jsonb_build_object('Content-Type','application/json','Authorization',%L), body := jsonb_build_object('limit',150,'rescore_before',(now()-interval '30 days')::text));
  $$, v_base||'marketplace-relevance-rescore', v_auth));

  PERFORM cron.schedule('marketplace_categorize_weekly', '40 2 * * 3', format($$
    SELECT net.http_post(url := %L, headers := jsonb_build_object('Content-Type','application/json','Authorization',%L), body := jsonb_build_object('limit',150));
  $$, v_base||'marketplace-categorize', v_auth));
END
$cron$;

INSERT INTO admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule) VALUES
('marketplace_enrich_weekly','Marketplace enrich','Weekly re-fetch of listing description/image/link-health from source.','system',true,'{"type":"schedule"}','[]','{"type":"edge","fn":"marketplace-enrich"}','0 2 * * 3'),
('marketplace_relevance_rescore_weekly','Marketplace relevance re-score','Weekly LLM re-score of listings not classified in 30d (kink/brand-aware).','system',true,'{"type":"schedule"}','[]','{"type":"edge","fn":"marketplace-relevance-rescore"}','20 2 * * 3'),
('marketplace_categorize_weekly','Marketplace categorize','Weekly LLM categorization of legacy/uncategorized listings into the content taxonomy.','system',true,'{"type":"schedule"}','[]','{"type":"edge","fn":"marketplace-categorize"}','40 2 * * 3')
ON CONFLICT (slug) DO NOTHING;
