-- Search Intelligence foundation
-- Tables and RPCs that power the /admin/search-intelligence surface.
-- Additive only: nothing in here changes existing search behaviour until the
-- edge function and shell-script backfill explicitly push synonym/setting rows
-- into Meilisearch.

-- ── search_synonyms ──────────────────────────────────────────────────────────
create table if not exists public.search_synonyms (
  id               uuid primary key default gen_random_uuid(),
  terms            text[] not null check (array_length(terms, 1) >= 1),
  replacements     text[] not null check (array_length(replacements, 1) >= 1),
  locale           text not null default '*'
                   check (locale ~ '^(\*|[a-z]{2}(-[A-Z]{2})?)$'),
  indexes          text[] not null default '{}'::text[],
  is_one_way       boolean not null default false,
  status           text not null default 'pending'
                   check (status in ('pending','approved','active','rejected','archived')),
  source           text not null default 'manual'
                   check (source in ('manual','imported','ai-suggested')),
  confidence_score numeric(4,3) check (
    confidence_score is null or (confidence_score >= 0 and confidence_score <= 1)
  ),
  notes            text,
  tag_id           uuid references public.unified_tags(id) on delete set null,
  tag_alias_id     uuid references public.tag_aliases(id) on delete set null,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  approved_by      uuid references auth.users(id) on delete set null,
  approved_at      timestamptz,
  archived_at      timestamptz
);

create index if not exists search_synonyms_status_idx
  on public.search_synonyms (status);
create index if not exists search_synonyms_locale_idx
  on public.search_synonyms (locale);
create index if not exists search_synonyms_tag_idx
  on public.search_synonyms (tag_id) where tag_id is not null;
create index if not exists search_synonyms_terms_gin
  on public.search_synonyms using gin (terms);

-- ── search_settings_versions ─────────────────────────────────────────────────
create table if not exists public.search_settings_versions (
  id          bigserial primary key,
  index_name  text not null,
  version     integer not null,
  channel     text not null default 'active' check (channel in ('active','draft')),
  settings    jsonb not null,
  comment     text,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (index_name, version)
);

create index if not exists search_settings_versions_index_idx
  on public.search_settings_versions (index_name, created_at desc);

-- ── search_audit_log ─────────────────────────────────────────────────────────
create table if not exists public.search_audit_log (
  id            bigserial primary key,
  actor_id      uuid references auth.users(id) on delete set null,
  action        text not null,
  resource_type text not null,
  resource_id   text,
  before_state  jsonb,
  after_state   jsonb,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists search_audit_log_created_idx
  on public.search_audit_log (created_at desc);
create index if not exists search_audit_log_actor_idx
  on public.search_audit_log (actor_id, created_at desc);
create index if not exists search_audit_log_resource_idx
  on public.search_audit_log (resource_type, resource_id);

-- ── search_reindex_jobs ──────────────────────────────────────────────────────
create table if not exists public.search_reindex_jobs (
  id              uuid primary key default gen_random_uuid(),
  index_name      text not null,
  scope           jsonb not null default '{}'::jsonb,
  status          text not null default 'pending'
                  check (status in ('pending','running','completed','failed','cancelled')),
  total           integer not null default 0,
  processed       integer not null default 0,
  errors          jsonb not null default '[]'::jsonb,
  meili_task_uids integer[] not null default '{}',
  triggered_by    uuid references auth.users(id) on delete set null,
  started_at      timestamptz,
  finished_at     timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists search_reindex_jobs_status_idx
  on public.search_reindex_jobs (status, created_at desc);

-- ── search_visibility_scores ─────────────────────────────────────────────────
create table if not exists public.search_visibility_scores (
  entity_type  text not null,
  entity_id    uuid not null,
  score        numeric(4,3) not null,
  breakdown    jsonb not null,
  suggestions  text[] not null default '{}',
  computed_at  timestamptz not null default now(),
  primary key (entity_type, entity_id)
);

create index if not exists search_visibility_scores_score_idx
  on public.search_visibility_scores (entity_type, score asc);

-- ── record_search_audit ──────────────────────────────────────────────────────
-- Convenience wrapper used by the edge function. SECURITY DEFINER so callers
-- without direct INSERT on search_audit_log can record their action.
create or replace function public.record_search_audit(
  p_action        text,
  p_resource_type text,
  p_resource_id   text,
  p_before_state  jsonb default null,
  p_after_state   jsonb default null,
  p_metadata      jsonb default '{}'::jsonb
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare new_id bigint;
begin
  insert into public.search_audit_log (
    actor_id, action, resource_type, resource_id,
    before_state, after_state, metadata
  ) values (
    auth.uid(), p_action, p_resource_type, p_resource_id,
    p_before_state, p_after_state, coalesce(p_metadata, '{}'::jsonb)
  ) returning id into new_id;
  return new_id;
end $$;

revoke all on function public.record_search_audit(text, text, text, jsonb, jsonb, jsonb)
  from public;
grant execute on function public.record_search_audit(text, text, text, jsonb, jsonb, jsonb)
  to authenticated, service_role;

-- ── compute_visibility_score (stub) ──────────────────────────────────────────
-- Returns a coherent JSONB shape so the contract is testable. Production
-- per-axis logic lands in a follow-up migration; the shape stays stable.
-- Axes intentionally return 0.5 placeholders today.
create or replace function public.compute_visibility_score(
  p_entity_type text,
  p_entity_id   uuid
) returns jsonb
language plpgsql
stable
as $$
declare
  v_breakdown jsonb;
  v_score numeric;
  v_axis_tags    numeric := 0.5;
  v_axis_geo     numeric := 0.5;
  v_axis_images  numeric := 0.5;
  v_axis_dates   numeric := 0.5;
  v_axis_text    numeric := 0.5;
  v_axis_syn     numeric := 0.5;
  v_axis_query   numeric := 0.5;
  w_tag    constant numeric := 0.20;
  w_geo    constant numeric := 0.15;
  w_image  constant numeric := 0.15;
  w_date   constant numeric := 0.10;
  w_text   constant numeric := 0.20;
  w_syn    constant numeric := 0.10;
  w_query  constant numeric := 0.10;
begin
  v_score :=
      v_axis_tags   * w_tag   +
      v_axis_geo    * w_geo   +
      v_axis_images * w_image +
      v_axis_dates  * w_date  +
      v_axis_text   * w_text  +
      v_axis_syn    * w_syn   +
      v_axis_query  * w_query;

  v_breakdown := jsonb_build_object(
    'tags',     jsonb_build_object('score', v_axis_tags,   'weight', w_tag),
    'geo',      jsonb_build_object('score', v_axis_geo,    'weight', w_geo),
    'images',   jsonb_build_object('score', v_axis_images, 'weight', w_image),
    'dates',    jsonb_build_object('score', v_axis_dates,  'weight', w_date),
    'text',     jsonb_build_object('score', v_axis_text,   'weight', w_text),
    'synonyms', jsonb_build_object('score', v_axis_syn,    'weight', w_syn),
    'queries',  jsonb_build_object('score', v_axis_query,  'weight', w_query)
  );

  return jsonb_build_object(
    'entity_type', p_entity_type,
    'entity_id',   p_entity_id,
    'score',       round(v_score, 3),
    'breakdown',   v_breakdown,
    'suggestions', '[]'::jsonb,
    'computed_at', now()
  );
end $$;

revoke all on function public.compute_visibility_score(text, uuid) from public;
grant execute on function public.compute_visibility_score(text, uuid)
  to authenticated, service_role;

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.search_synonyms          enable row level security;
alter table public.search_settings_versions enable row level security;
alter table public.search_audit_log         enable row level security;
alter table public.search_reindex_jobs      enable row level security;
alter table public.search_visibility_scores enable row level security;

-- Synonyms: anyone can read approved / active rows so the read path may use
-- them in the future; writes are admin-only via the edge function (service role).
drop policy if exists synonyms_read on public.search_synonyms;
create policy synonyms_read on public.search_synonyms
  for select using (status in ('active','approved'));

-- Reindex jobs: admins/moderators read, no direct writes.
drop policy if exists reindex_jobs_admin_read on public.search_reindex_jobs;
create policy reindex_jobs_admin_read on public.search_reindex_jobs
  for select using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid() and role in ('admin','moderator')
    )
  );

-- Audit log: admin read only.
drop policy if exists audit_admin_read on public.search_audit_log;
create policy audit_admin_read on public.search_audit_log
  for select using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid() and role = 'admin'
    )
  );

-- Settings versions: admin read only.
drop policy if exists settings_versions_admin_read on public.search_settings_versions;
create policy settings_versions_admin_read on public.search_settings_versions
  for select using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid() and role = 'admin'
    )
  );

-- Visibility scores: public read so editors / content owners can see their own.
drop policy if exists visibility_scores_read on public.search_visibility_scores;
create policy visibility_scores_read on public.search_visibility_scores
  for select using (true);

comment on table public.search_synonyms is
  'Runtime synonym registry. Active rows are projected into Meilisearch index settings by the search-intelligence edge function.';
comment on table public.search_settings_versions is
  'Version history for per-index Meilisearch settings. Latest channel=''active'' is the desired state.';
comment on table public.search_audit_log is
  'Audit trail for admin actions affecting search behaviour.';
comment on table public.search_reindex_jobs is
  'Persistent record of reindex operations with progress + Meili task UIDs.';
comment on table public.search_visibility_scores is
  'Per-entity computed visibility score (0..1) with axis breakdown and suggestions.';
