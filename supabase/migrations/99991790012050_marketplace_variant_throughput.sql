-- Fifty rows every five minutes would require ~103 hours for the production
-- backlog. Claims are expiring and overlap-safe, so keep the proven batch size
-- and increase cadence to 1,500 visits/hour (about 41 hours for 61k rows).

UPDATE public.admin_automations SET
  enabled=true,consecutive_failures=0,auto_pause_threshold=3,schedule='*/2 * * * *',
  description='Indexed, overlap-safe variant/attribute extraction. Fifty rows every two minutes provides at least 1,500 visits/hour while retaining bounded requests.',
  action=jsonb_build_object('type','cron','jobname','marketplace-variant-backfill','command',$cmd$
    SELECT net.http_post(
      url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/marketplace-variant-backfill',
      headers := jsonb_build_object('Content-Type','application/json','X-Webhook-Secret',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='marketplace_tag_webhook_secret')),
      body := '{"batch_limit":50,"auto_scale":false}'::jsonb, timeout_milliseconds := 120000);
  $cmd$)
WHERE slug='marketplace_variant_backfill';

SELECT public.sync_automations_to_cron(true);
