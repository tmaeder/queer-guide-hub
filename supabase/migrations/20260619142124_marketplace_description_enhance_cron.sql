-- Translate + clean poor marketplace descriptions (Phase 1: ohmyfantasy German).
--
-- ohmyfantasy.com is a German-only Shopify store (~6.1k listings = 28% of the
-- catalog) that shipped German descriptions on an English-default site. The
-- marketplace-description-enhance edge fn translates DE→EN and strips merchant
-- boilerplate (size charts, care/wash, shipping, composition tables, SKUs, slop)
-- via LLM (Cloudflare Workers AI; auto-upgrades to Claude Haiku if ANTHROPIC_API_KEY
-- is ever configured), preserving the original in description_i18n for reversibility
-- + locale serving. This cron drains the backlog (~30/run → ~17h) and cleans future
-- ohmyfantasy ingests. Once that merchant is clean, re-point body.merchant_domain
-- for Phase 2 (fluff/walls on other merchants).
select cron.schedule('marketplace_description_enhance', '*/5 * * * *', $cron$
  select net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/marketplace-description-enhance',
    headers := jsonb_build_object('Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8'),
    body := '{"merchant_domain":"ohmyfantasy.com","batch_size":30}'::jsonb,
    timeout_milliseconds := 90000
  );
$cron$);
