-- github_poller_state: single-row cursor table for github-notifications-poller.
create table if not exists public.github_poller_state (
  id text primary key default 'singleton',
  cursor timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.github_poller_state enable row level security;

drop policy if exists "github_poller_state service role all" on public.github_poller_state;
create policy "github_poller_state service role all"
  on public.github_poller_state
  for all
  to service_role
  using (true)
  with check (true);

insert into public.github_poller_state (id, cursor)
values ('singleton', now() - interval '1 hour')
on conflict (id) do nothing;

-- Cron: every 5 minutes, fire github-notifications-poller as a safety net.
do $$
begin
  perform cron.unschedule('github-notifications-poller-5min')
  where exists (select 1 from cron.job where jobname = 'github-notifications-poller-5min');
exception when undefined_function then null;
end $$;

select cron.schedule(
  'github-notifications-poller-5min',
  '*/5 * * * *',
  $cron$
  select net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/github-notifications-poller',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) as request_id;
  $cron$
);
