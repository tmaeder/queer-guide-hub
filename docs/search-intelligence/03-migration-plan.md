# Phase 0 — Migration Plan

Concrete schema changes and a safe rollout path. All migrations are additive; no existing column or table is dropped.

## Migration `20260428120000_search_intelligence.sql`

### Tables

```sql
create table public.search_synonyms (
  id              uuid primary key default gen_random_uuid(),
  -- Synonym group: every term in `terms` matches every term in `replacements`.
  -- For a one-way alias use `is_one_way = true` (matches Meilisearch behavior).
  terms           text[]      not null check (array_length(terms,1) >= 1),
  replacements    text[]      not null check (array_length(replacements,1) >= 1),
  locale          text        not null default '*' check (locale ~ '^(\*|[a-z]{2}(-[A-Z]{2})?)$'),
  indexes         text[]      not null default '{}'::text[], -- empty = all indexes
  is_one_way      boolean     not null default false,
  status          text        not null default 'pending'
                  check (status in ('pending','approved','active','rejected','archived')),
  source          text        not null default 'manual'
                  check (source in ('manual','imported','ai-suggested')),
  confidence_score numeric(4,3) check (confidence_score is null or (confidence_score >= 0 and confidence_score <= 1)),
  notes           text,
  -- Optional links to the editorial taxonomy
  tag_id          uuid references public.unified_tags(id) on delete set null,
  tag_alias_id    uuid references public.tag_aliases(id) on delete set null,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  approved_by     uuid references auth.users(id),
  approved_at     timestamptz,
  archived_at     timestamptz
);

create index search_synonyms_status_idx on public.search_synonyms(status);
create index search_synonyms_locale_idx on public.search_synonyms(locale);
create index search_synonyms_tag_idx    on public.search_synonyms(tag_id) where tag_id is not null;
create index search_synonyms_terms_gin  on public.search_synonyms using gin(terms);

create table public.search_settings_versions (
  id            bigserial primary key,
  index_name    text        not null,
  version       integer     not null,
  channel       text        not null default 'active' check (channel in ('active','draft')),
  settings      jsonb       not null,
  comment       text,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  unique (index_name, version)
);

create index search_settings_versions_index_idx
  on public.search_settings_versions(index_name, created_at desc);

create table public.search_audit_log (
  id            bigserial primary key,
  actor_id      uuid references auth.users(id),
  action        text        not null,    -- e.g. synonym.create, settings.apply, reindex.start
  resource_type text        not null,    -- e.g. synonym, settings, index, reindex_job
  resource_id   text,                    -- string for flexibility (uuid or slug)
  before_state  jsonb,
  after_state   jsonb,
  metadata      jsonb       not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index search_audit_log_created_idx on public.search_audit_log(created_at desc);
create index search_audit_log_actor_idx   on public.search_audit_log(actor_id, created_at desc);
create index search_audit_log_resource_idx on public.search_audit_log(resource_type, resource_id);

create table public.search_reindex_jobs (
  id              uuid primary key default gen_random_uuid(),
  index_name      text        not null,
  scope           jsonb       not null default '{}'::jsonb, -- {ids?:[], filter?:{}, full?:bool}
  status          text        not null default 'pending'
                  check (status in ('pending','running','completed','failed','cancelled')),
  total           integer     not null default 0,
  processed       integer     not null default 0,
  errors          jsonb       not null default '[]'::jsonb,
  meili_task_uids integer[]   not null default '{}',
  triggered_by    uuid references auth.users(id),
  started_at      timestamptz,
  finished_at     timestamptz,
  created_at      timestamptz not null default now()
);

create index search_reindex_jobs_status_idx on public.search_reindex_jobs(status, created_at desc);

create table public.search_visibility_scores (
  entity_type   text        not null,
  entity_id     uuid        not null,
  score         numeric(4,3) not null,
  breakdown     jsonb       not null,
  suggestions   text[]      not null default '{}',
  computed_at   timestamptz not null default now(),
  primary key (entity_type, entity_id)
);

create index search_visibility_scores_score_idx
  on public.search_visibility_scores(entity_type, score asc);
```

### Helper RPCs

```sql
create or replace function public.record_search_audit(
  p_action        text,
  p_resource_type text,
  p_resource_id   text,
  p_before_state  jsonb default null,
  p_after_state   jsonb default null,
  p_metadata      jsonb default '{}'::jsonb
) returns bigint
language plpgsql security definer set search_path = public
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
```

```sql
-- compute_visibility_score: returns score + breakdown JSONB.
-- Real per-axis logic lives in plpgsql. Weights are inline; the edge function
-- pulls them from search_settings_versions(channel='active', index_name='_visibility_weights')
-- if present, else falls back to defaults below.
create or replace function public.compute_visibility_score(
  p_entity_type text,
  p_entity_id   uuid
) returns jsonb
language plpgsql stable
as $$
declare
  v_breakdown jsonb := '{}'::jsonb;
  v_score    numeric := 0;
  v_suggestions text[] := '{}';
  -- per-axis scratch
  v_tag_score   numeric := 0;
  v_geo_score   numeric := 0;
  v_image_score numeric := 0;
  v_date_score  numeric := 0;
  v_text_score  numeric := 0;
  v_syn_score   numeric := 0;
  -- weights (must sum to 1.0)
  w_tag   constant numeric := 0.20;
  w_geo   constant numeric := 0.15;
  w_image constant numeric := 0.15;
  w_date  constant numeric := 0.10;
  w_text  constant numeric := 0.20;
  w_syn   constant numeric := 0.10;
  w_query constant numeric := 0.10;
begin
  -- placeholder values; the production version (added in a follow-up) inspects
  -- the actual entity row and unified_tag_assignments / images / dates.
  -- This stub still returns a coherent JSONB shape so the contract is testable.
  v_tag_score := 0.5;
  v_geo_score := 0.5;
  v_image_score := 0.5;
  v_date_score := 0.5;
  v_text_score := 0.5;
  v_syn_score := 0.5;

  v_score :=
      v_tag_score   * w_tag   +
      v_geo_score   * w_geo   +
      v_image_score * w_image +
      v_date_score  * w_date  +
      v_text_score  * w_text  +
      v_syn_score   * w_syn   +
      0.5           * w_query;

  v_breakdown := jsonb_build_object(
    'tags',     jsonb_build_object('score', v_tag_score,   'weight', w_tag),
    'geo',      jsonb_build_object('score', v_geo_score,   'weight', w_geo),
    'images',   jsonb_build_object('score', v_image_score, 'weight', w_image),
    'dates',    jsonb_build_object('score', v_date_score,  'weight', w_date),
    'text',     jsonb_build_object('score', v_text_score,  'weight', w_text),
    'synonyms', jsonb_build_object('score', v_syn_score,   'weight', w_syn),
    'queries',  jsonb_build_object('score', 0.5,           'weight', w_query)
  );

  return jsonb_build_object(
    'score', round(v_score, 3),
    'breakdown', v_breakdown,
    'suggestions', to_jsonb(v_suggestions),
    'computed_at', now()
  );
end $$;
```

### RLS

```sql
alter table public.search_synonyms          enable row level security;
alter table public.search_settings_versions enable row level security;
alter table public.search_audit_log         enable row level security;
alter table public.search_reindex_jobs      enable row level security;
alter table public.search_visibility_scores enable row level security;

-- Public read for synonyms (so the read worker / clients can preview);
-- writes admin-only via edge function which runs as service role.
create policy synonyms_read on public.search_synonyms
  for select using (status in ('active','approved'));

-- All other tables: service-role-only writes; admin reads via edge function
-- (which uses service role). No browser-direct access.
create policy reindex_jobs_admin_read on public.search_reindex_jobs
  for select using (
    exists (select 1 from public.user_roles
            where user_id = auth.uid() and role in ('admin','moderator'))
  );

create policy audit_admin_read on public.search_audit_log
  for select using (
    exists (select 1 from public.user_roles
            where user_id = auth.uid() and role = 'admin')
  );

create policy settings_versions_admin_read on public.search_settings_versions
  for select using (
    exists (select 1 from public.user_roles
            where user_id = auth.uid() and role = 'admin')
  );

create policy visibility_scores_read on public.search_visibility_scores
  for select using (true);
```

## Backfill / data moves

1. **Synonyms from `meilisearch/configure-indexes.sh`**: a one-shot script (`scripts/import-synonyms-from-shell.ts`, future) parses the inline synonym maps and inserts them into `search_synonyms` with `source='imported', status='active'`. Until that runs, the admin UI will show an empty synonyms list — Meili keeps using whatever was last applied by the shell script. Shipping the table without the backfill is safe.

2. **Initial settings snapshot**: when the admin first opens the Settings tab, the edge function reads live Meilisearch settings for each index and writes them into `search_settings_versions` (channel=`active`, version=1, comment=`'imported from live'`). This anchors version history without a manual data move.

3. **Visibility scores**: lazy. The first time an entity is opened in the admin (or a daily cron is enabled), `compute_visibility_score` is called and the result is upserted. Production-grade per-axis logic ships in a follow-up migration; the stub is good enough to power the UI scaffolding.

4. **Tag aliases → search synonyms**: a follow-up migration links existing `tag_aliases` rows to `search_synonyms` rows automatically (`tag_alias_id` foreign key). Not done in Phase 0 to keep this migration small and reviewable.

## Risk-bound rollback

- Tables are new; rolling back means `drop table` of the five new tables and the two functions.
- Nothing else in the codebase reads these tables yet, so a rollback affects only the new admin page (which is itself feature-flagged).
- Settings version inserts on first read are guarded by `if not exists` semantics — re-running the import is idempotent.

## Sequencing

1. Apply migration to staging.
2. Deploy `search-intelligence` edge function to staging.
3. Verify admin UI behind feature flag `VITE_FEATURE_SEARCH_INTELLIGENCE=1`.
4. Promote migration to production (still feature-flagged off for non-admins).
5. Run shell-synonym import script (offline) to seed `search_synonyms`.
6. Flip the flag for admins.

This sequence guarantees the production search read path (`workers/search-proxy`) and write path (`meilisearch-sync`) are untouched until step 5.
