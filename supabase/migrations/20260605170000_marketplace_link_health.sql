-- M-2 (audit 2026-06-05) — enable marketplace link-health checking.
-- link_health was 'unchecked' for all 6,532 listings ("0 broken" = no check ran).
-- The marketplace-link-checker edge function (new) probes external_url and writes
-- link_health + link_checked_at, demoting broken listings to status='inactive'.
-- This adds the freshness column and a daily pg_cron that drives it.

alter table public.marketplace_listings
  add column if not exists link_checked_at timestamptz;

create index if not exists marketplace_listings_link_checked_idx
  on public.marketplace_listings (link_checked_at nulls first);

-- Daily link-health sweep (was an unscheduled workflow node; run the function
-- directly like venue-url-checker). cron.schedule upserts by job name.
select cron.unschedule('marketplace-link-checker') where exists (
  select 1 from cron.job where jobname = 'marketplace-link-checker'
);
select cron.schedule(
  'marketplace-link-checker',
  '37 3 * * *',
  $$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL') || '/functions/v1/marketplace-link-checker',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY')
      ),
      body := '{"batch_size":200,"stale_days":30}'::jsonb
    )
  $$
);
