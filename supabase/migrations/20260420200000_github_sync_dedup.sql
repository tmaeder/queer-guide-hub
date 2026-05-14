-- github_event_ids: generic dedup for GH events (comment ids, notification thread ids, etc.)
-- complements webhook_deliveries (which is keyed on x-github-delivery).
create table if not exists public.github_event_ids (
  id text primary key,
  kind text not null,
  seen_at timestamptz not null default now()
);

comment on table public.github_event_ids is
  'Dedup store for GitHub events keyed by (issue_comment_id, notification_thread_id, etc.). Prevents double-processing when webhook + poller both deliver the same event.';

create index if not exists github_event_ids_kind_seen_at_idx
  on public.github_event_ids (kind, seen_at desc);

-- Column to let the notifications poller skip rows the webhook already updated.
alter table public.community_submissions
  add column if not exists github_last_synced_at timestamptz;

create index if not exists community_submissions_github_issue_number_idx
  on public.community_submissions (github_issue_number)
  where github_issue_number is not null;

-- RLS: service-role only (admin dashboard doesn't read this directly).
alter table public.github_event_ids enable row level security;

drop policy if exists "github_event_ids service role all" on public.github_event_ids;
create policy "github_event_ids service role all"
  on public.github_event_ids
  for all
  to service_role
  using (true)
  with check (true);
