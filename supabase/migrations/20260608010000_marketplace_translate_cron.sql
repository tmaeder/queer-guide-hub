-- Self-healing cron for German→English title translation of the ohmyfantasy
-- catalog (marketplace-translate edge fn). Runs 3×/hour; idempotent via the
-- title_i18n->>de marker, so it resumes the backlog whenever the shared CF
-- Workers AI backend has capacity and is a cheap no-op once the backlog clears.
-- (A concurrent translate-i18n-batch job was saturating CF AI when this was set
-- up, blocking a one-shot drive — hence the resilient cron approach.)
DO $cron$
DECLARE
  v_auth text := 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8';
BEGIN
  PERFORM cron.schedule('marketplace_translate_titles', '7,27,47 * * * *', format($$
    SELECT net.http_post(url := %L, headers := jsonb_build_object('Content-Type','application/json','Authorization',%L), body := jsonb_build_object('limit',250,'source_type','ohmyfantasy'));
  $$, 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/marketplace-translate', v_auth));
END
$cron$;

INSERT INTO admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES ('marketplace_translate_titles','Marketplace title translation',
  'Translates German ohmyfantasy titles to English; preserves German in title_i18n.de. Self-healing — resumes when CF Workers AI has capacity. Disable once backlog clears.',
  'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
  '{"type":"edge","fn":"marketplace-translate"}'::jsonb, '7,27,47 * * * *')
ON CONFLICT (slug) DO NOTHING;
