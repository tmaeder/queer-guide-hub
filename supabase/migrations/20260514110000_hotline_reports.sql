-- Community reports for broken/unsafe crisis hotline entries on /help.
-- Anonymous reporting (no auth required) — crisis context means low friction matters.
-- Admins read + resolve via the CMS hotline editor.

create table if not exists public.hotline_reports (
  id uuid primary key default gen_random_uuid(),
  hotline_id text not null,
  reason text not null check (reason in ('disconnected','wrong_number','closed','unsafe','other')),
  detail text,
  user_country text,            -- optional, populated from CF request.cf.country if available
  resolved boolean not null default false,
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists hotline_reports_hotline_id_idx on public.hotline_reports (hotline_id);
create index if not exists hotline_reports_unresolved_idx on public.hotline_reports (created_at desc) where resolved = false;

alter table public.hotline_reports enable row level security;

-- Anyone (including anon) can insert a report. Crisis pages must not gate reports behind auth.
drop policy if exists hotline_reports_insert on public.hotline_reports;
create policy hotline_reports_insert on public.hotline_reports
  for insert
  to anon, authenticated
  with check (true);

-- Only admins can read.
drop policy if exists hotline_reports_admin_select on public.hotline_reports;
create policy hotline_reports_admin_select on public.hotline_reports
  for select
  to authenticated
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role in ('admin','moderator')
    )
  );

-- Only admins can update (mark resolved).
drop policy if exists hotline_reports_admin_update on public.hotline_reports;
create policy hotline_reports_admin_update on public.hotline_reports
  for update
  to authenticated
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role in ('admin','moderator')
    )
  );

comment on table public.hotline_reports is 'Community reports of broken/unsafe hotlines on /help. Anon insert, admin read/update.';
