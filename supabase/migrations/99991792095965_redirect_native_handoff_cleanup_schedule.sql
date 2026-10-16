-- Expired capability digests only; no HTTP/Vault/provider credentials or new
-- public execution grants. The existing consumer still enforces TTL immediately.
DO $migration$
BEGIN
 IF to_regprocedure('cron.schedule(text,text,text)') IS NULL THEN
  RAISE NOTICE 'pg_cron unavailable; redirect native handoff cleanup not scheduled';
  RETURN;
 END IF;
 EXECUTE 'SELECT cron.schedule($1,$2,$3)' USING
  'redirect-native-handoff-expiry','* * * * *',$cron$
BEGIN;
SET LOCAL statement_timeout = '10s';
SET LOCAL lock_timeout = '1s';
SET LOCAL ROLE service_role;
SELECT public.cleanup_redirect_native_handoffs(500);
COMMIT;
$cron$;
END $migration$;
