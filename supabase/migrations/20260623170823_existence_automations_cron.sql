INSERT INTO public.api_circuit_breakers (api_name, threshold, reset_timeout_seconds)
VALUES ('llm.existence.pageread', 5, 300)
ON CONFLICT (api_name) DO NOTHING;

INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, action, schedule)
VALUES
 ('existence_decision_venue','Existence decision — venues',
  'Archives venues with >=2 independent strong dead signals (reversible); flags single-signal cases for review. Conservative: featured/community venues route to review.',
  'system', false, '{"type":"schedule"}'::jsonb, '{"type":"rpc","fn":"run_existence_decision_venue"}'::jsonb, '45 4 * * *'),
 ('existence_decision_event','Existence decision — events',
  'Archives events with >=2 independent strong dead signals (reversible); flags single-signal cases for review.',
  'system', false, '{"type":"schedule"}'::jsonb, '{"type":"rpc","fn":"run_existence_decision_event"}'::jsonb, '50 4 * * *'),
 ('existence_decision_marketplace','Existence decision — marketplace',
  'Demotes/archives listings with >=2 independent strong dead signals (reversible); flags single-signal cases for review.',
  'system', false, '{"type":"schedule"}'::jsonb, '{"type":"rpc","fn":"run_existence_decision_marketplace"}'::jsonb, '55 4 * * *'),
 ('existence_signals_purge','Existence signals purge',
  'Prunes the existence-signal ledger (keeps latest ~20/entity and anything < 180d).',
  'system', true, '{"type":"schedule"}'::jsonb, '{"type":"rpc","fn":"run_existence_signals_purge"}'::jsonb, '15 5 * * *')
ON CONFLICT (slug) DO UPDATE
  SET name=excluded.name, description=excluded.description, trigger=excluded.trigger,
      action=excluded.action, schedule=excluded.schedule;

UPDATE public.admin_automations
  SET action='{"type":"rpc","fn":"run_event_date_lifecycle"}'::jsonb,
      description='Marks past active events completed and de-indexes long-past (>180d) events; emits date_lifecycle signals for the existence engine.',
      schedule='30 3 * * *'
  WHERE slug='event_auto_archive';

SELECT cron.unschedule('existence_decision_venue') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='existence_decision_venue');
SELECT cron.unschedule('existence_decision_event') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='existence_decision_event');
SELECT cron.unschedule('existence_decision_marketplace') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='existence_decision_marketplace');
SELECT cron.unschedule('existence_signals_purge') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='existence_signals_purge');

SELECT cron.schedule('existence_decision_venue', '45 4 * * *',
  'SET statement_timeout = 0; SELECT public.run_existence_decision_venue();');
SELECT cron.schedule('existence_decision_event', '50 4 * * *',
  'SET statement_timeout = 0; SELECT public.run_existence_decision_event();');
SELECT cron.schedule('existence_decision_marketplace', '55 4 * * *',
  'SET statement_timeout = 0; SELECT public.run_existence_decision_marketplace();');
SELECT cron.schedule('existence_signals_purge', '15 5 * * *',
  'SELECT public.run_existence_signals_purge();');

DO $outer$
DECLARE jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname='event_auto_archive';
  IF jid IS NULL THEN
    PERFORM cron.schedule('event_auto_archive', '30 3 * * *',
      'SET statement_timeout = 0; SELECT public.run_event_auto_archive();');
  ELSE
    PERFORM cron.alter_job(jid, schedule := '30 3 * * *',
      command := 'SET statement_timeout = 0; SELECT public.run_event_auto_archive();');
  END IF;
  SELECT jobid INTO jid FROM cron.job WHERE jobname='event_trust_recompute';
  IF jid IS NOT NULL THEN
    PERFORM cron.alter_job(jid, schedule := '10 5 * * *');
  END IF;
END $outer$;

SELECT cron.unschedule('existence_deep_probe') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='existence_deep_probe');
SELECT cron.unschedule('existence_external_osm') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='existence_external_osm');

SELECT cron.schedule('existence_deep_probe', '20 2 * * *', $cron$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/existence-deep-probe',
    headers := jsonb_build_object('Content-Type','application/json',
      'X-Webhook-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='existence_webhook_secret')),
    body := '{"entity_type":"both","batch_limit":40,"llm_daily_cap":150}'::jsonb);
$cron$);

SELECT cron.schedule('existence_external_osm', '40 2 * * *', $cron$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/existence-external-osm',
    headers := jsonb_build_object('Content-Type','application/json',
      'X-Webhook-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='existence_webhook_secret')),
    body := '{"batch_limit":30}'::jsonb);
$cron$);;
