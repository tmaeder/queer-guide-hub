-- Production E2E found that SUPABASE_SERVICE_ROLE_KEY is not stored in Vault,
-- so pg_net omitted the empty Authorization header and the link checker
-- returned 401. Use the existing internal-invocation contract instead.

UPDATE public.admin_automations SET
  action=jsonb_build_object('type','cron','jobname','marketplace-link-checker','command',$cmd$
    SELECT net.http_post(
      url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/marketplace-link-checker',
      headers := jsonb_build_object('Content-Type','application/json','X-Internal-Secret',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')),
      body := '{"batch_size":75}'::jsonb, timeout_milliseconds := 120000);
  $cmd$)
WHERE slug='marketplace_link_checker';

UPDATE public.admin_automations SET
  action=jsonb_build_object('type','cron','jobname','marketplace-taxonomy-classify','command',$cmd$
    SELECT net.http_post(
      url:='https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/marketplace-taxonomy-classify',
      headers:=jsonb_build_object('Content-Type','application/json','X-Internal-Secret',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')),
      body:='{"batch_size":25}'::jsonb,timeout_milliseconds:=120000);
  $cmd$)
WHERE slug='marketplace_taxonomy_classify';

SELECT public.sync_automations_to_cron(true);
