-- phash backfill forward-progress marker. The backfill selector was `phash IS
-- NULL` with no attempted-marker, so it re-selected the same front cluster of
-- rows every run — dominated by dead/unfetchable URLs — and never advanced past
-- them (coverage stuck). phash_checked_at is stamped on EVERY attempt (success or
-- skip), and the selector now excludes already-checked rows, so each null-phash
-- row is attempted exactly once and the sweep advances.
ALTER TABLE public.image_assets ADD COLUMN IF NOT EXISTS phash_checked_at timestamptz;
CREATE INDEX IF NOT EXISTS image_assets_phash_todo_idx
  ON public.image_assets (id) WHERE phash IS NULL AND phash_checked_at IS NULL AND status = 'active';

-- Shrink the cron batch: imagescript's full-image decode OOMs the isolate
-- (546 WORKER_RESOURCE_LIMIT) after a handful of large decodes, so the sweep is
-- small-and-often (this later migration overrides the limit:60 set in
-- 20260725220000). Progress is guaranteed by the phash_checked_at marker above.
select cron.schedule('image_phash_backfill', '30 * * * *', $cron$
  select net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/image-phash-backfill',
    headers := jsonb_build_object('Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')),
    body := '{"limit":6}'::jsonb, timeout_milliseconds := 55000);
$cron$);
