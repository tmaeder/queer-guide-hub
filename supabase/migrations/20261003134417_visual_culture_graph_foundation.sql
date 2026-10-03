-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20261003134417 with no repo file — the signature of
-- MCP `apply_migration`, which stamps a version and commits nothing. An applied
-- version with no file fails migration-versions on every PR in the repo and
-- makes `db push` refuse to run.
--
-- Reconstructed from `schema_migrations.statements`, which holds the PARSED
-- statements: trailing semicolons are stripped (re-added here) and any original
-- comment header is NOT recorded, so the reasoning that accompanied this
-- migration is lost. Verified by md5 against a server-computed digest.
--
-- Never re-run: `db push` matches on version and skips an applied one. The file
-- exists so history is complete and a rebuild from zero works.
-- Visual Culture Graph
--
-- Cultural reference material is public only after editorial approval. Adult
-- claim payloads and personal hanky signals deliberately have no anon SELECT
-- path; Pages Functions expose the latter after age affirmation.

create table public.cultural_sources (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null,
  source_kind text not null check (source_kind in (
    'community', 'designer', 'archive', 'publication', 'institution', 'internal_reference'
  )),
  url text,
  publisher text,
  published_on date,
  retrieved_at timestamptz not null default now(),
  attribution text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cultural_nodes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  node_kind text not null check (node_kind in (
    'artifact', 'person', 'community', 'movement', 'archive', 'institution'
  )),
  artifact_kind text check (artifact_kind in (
    'flag', 'historic_symbol', 'hanky_code', 'wayfinding_concept'
  )),
  canonical_entity_type text,
  canonical_entity_id uuid,
  name text not null,
  name_i18n jsonb not null default '{}'::jsonb,
  description text,
  description_i18n jsonb not null default '{}'::jsonb,
  era_label text,
  sensitivity text not null default 'standard' check (sensitivity in ('standard', 'adult')),
  status text not null default 'draft' check (status in (
    'draft', 'review', 'published', 'disputed', 'retired'
  )),
  metadata jsonb not null default '{}'::jsonb,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((node_kind = 'artifact') = (artifact_kind is not null)),
  check ((canonical_entity_type is null) = (canonical_entity_id is null)),
  check (
    status <> 'published'
    or artifact_kind <> 'historic_symbol'
    or (era_label is not null and last_verified_at is not null)
  )
);

create unique index cultural_nodes_canonical_entity_uq
  on public.cultural_nodes (canonical_entity_type, canonical_entity_id)
  where canonical_entity_id is not null;

create index cultural_nodes_public_kind_idx
  on public.cultural_nodes (artifact_kind, name)
  where status = 'published';

create table public.cultural_variants (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null references public.cultural_nodes(id) on delete cascade,
  source_id uuid references public.cultural_sources(id) on delete restrict,
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  label text not null,
  label_i18n jsonb not null default '{}'::jsonb,
  region_code text,
  valid_from date,
  valid_through date,
  canonical_palette jsonb not null default '[]'::jsonb,
  render_spec jsonb not null default '{}'::jsonb,
  derived_theme jsonb not null default '{}'::jsonb,
  theme_reviewed_at timestamptz,
  status text not null default 'draft' check (status in (
    'draft', 'review', 'published', 'disputed', 'retired'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (node_id, slug),
  check (valid_through is null or valid_from is null or valid_through >= valid_from),
  check (
    status <> 'published'
    or (
      source_id is not null
      and render_spec <> '{}'::jsonb
      and (derived_theme = '{}'::jsonb or theme_reviewed_at is not null)
    )
  )
);

create index cultural_variants_node_status_idx
  on public.cultural_variants (node_id, status);

create table public.cultural_claims (
  id uuid primary key default gen_random_uuid(),
  subject_node_id uuid not null references public.cultural_nodes(id) on delete cascade,
  source_id uuid not null references public.cultural_sources(id) on delete restrict,
  predicate text not null check (predicate ~ '^[a-z][a-z0-9_]*$'),
  value_text text,
  value_json jsonb,
  value_i18n jsonb not null default '{}'::jsonb,
  geography_code text,
  valid_from date,
  valid_through date,
  confidence numeric(4,3) not null default 1 check (confidence between 0 and 1),
  status text not null default 'draft' check (status in (
    'draft', 'review', 'published', 'disputed', 'retired'
  )),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((value_text is null) <> (value_json is null)),
  check (valid_through is null or valid_from is null or valid_through >= valid_from),
  check (status <> 'published' or reviewed_at is not null)
);

create index cultural_claims_subject_status_idx
  on public.cultural_claims (subject_node_id, status, predicate);

create table public.cultural_edges (
  id uuid primary key default gen_random_uuid(),
  source_node_id uuid not null references public.cultural_nodes(id) on delete cascade,
  target_node_id uuid not null references public.cultural_nodes(id) on delete cascade,
  source_id uuid references public.cultural_sources(id) on delete restrict,
  relationship text not null check (relationship in (
    'designed_by', 'used_by', 'reclaimed_by', 'represents', 'regional_variant_of',
    'supersedes', 'documented_by', 'associated_with', 'member_of', 'held_by'
  )),
  valid_from date,
  valid_through date,
  rationale text,
  status text not null default 'draft' check (status in (
    'draft', 'review', 'published', 'disputed', 'retired'
  )),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_node_id, target_node_id, relationship),
  check (source_node_id <> target_node_id),
  check (valid_through is null or valid_from is null or valid_through >= valid_from),
  check (status <> 'published' or (source_id is not null and reviewed_at is not null))
);

create index cultural_edges_source_status_idx
  on public.cultural_edges (source_node_id, status);

create index cultural_edges_target_status_idx
  on public.cultural_edges (target_node_id, status);

create table public.cultural_assignments (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null references public.cultural_nodes(id) on delete cascade,
  variant_id uuid references public.cultural_variants(id) on delete set null,
  entity_type text not null check (entity_type in (
    'guide', 'guide_section', 'milestone', 'personality', 'venue', 'event', 'city',
    'country', 'tag', 'marketplace', 'profile', 'campaign', 'organization'
  )),
  entity_id uuid not null,
  placement text not null check (placement in (
    'hero', 'route', 'chip', 'rail', 'map', 'filter', 'inline', 'share'
  )),
  association_kind text check (association_kind in (
    'literal_artifact', 'historic_association', 'cultural_reference', 'generic_rainbow'
  )),
  rationale text not null check (length(trim(rationale)) >= 8),
  position integer not null default 0,
  theme_eligible boolean not null default false,
  status text not null default 'proposed' check (status in (
    'proposed', 'approved', 'rejected', 'retired'
  )),
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (node_id, entity_type, entity_id, placement),
  check (status <> 'approved' or (approved_by is not null and approved_at is not null))
  ,check (
    entity_type <> 'marketplace'
    or status <> 'approved'
    or association_kind is not null
  )
);

create index cultural_assignments_entity_status_idx
  on public.cultural_assignments (entity_type, entity_id, placement, status, position);

create table public.cultural_link_proposals (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null references public.cultural_nodes(id) on delete cascade,
  entity_type text not null check (entity_type in (
    'guide', 'guide_section', 'milestone', 'personality', 'venue', 'event', 'city',
    'country', 'tag', 'marketplace', 'profile', 'campaign', 'organization'
  )),
  entity_id uuid not null,
  suggested_placement text not null default 'rail' check (suggested_placement in (
    'hero', 'route', 'chip', 'rail', 'map', 'filter', 'inline', 'share'
  )),
  suggestion_reason text not null,
  evidence jsonb not null default '{}'::jsonb,
  confidence numeric(4,3) not null default 0.5 check (confidence between 0 and 1),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (node_id, entity_type, entity_id, suggested_placement)
);

create index cultural_link_proposals_queue_idx
  on public.cultural_link_proposals (status, confidence desc, created_at)
  where status = 'pending';

create table public.user_cultural_preferences (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,
  followed_node_ids uuid[] not null default '{}',
  line_node_ids uuid[] not null default '{}',
  theme_mode text not null default 'standard' check (theme_mode in ('standard', 'my_lines')),
  updated_at timestamptz not null default now(),
  check (cardinality(followed_node_ids) <= 100),
  check (cardinality(line_node_ids) <= 12)
);

create table public.user_hanky_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  variant_id uuid not null references public.cultural_variants(id) on delete restrict,
  side text not null check (side in ('left', 'right', 'both')),
  visibility text not null default 'public_adult' check (visibility in (
    'private', 'members_adult', 'public_adult'
  )),
  region_code text,
  consented_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, variant_id),
  check (revoked_at is null or revoked_at >= consented_at)
);

create index user_hanky_signals_owner_active_idx
  on public.user_hanky_signals (user_id, visibility)
  where revoked_at is null;

create table public.user_hanky_consent_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  signal_id uuid not null references public.user_hanky_signals(id) on delete cascade,
  event_type text not null check (event_type in ('consented', 'revoked')),
  variant_id uuid not null,
  side text not null check (side in ('left', 'right', 'both')),
  visibility text not null check (visibility in ('private', 'members_adult', 'public_adult')),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index user_hanky_consent_events_owner_idx
  on public.user_hanky_consent_events (user_id, occurred_at desc);

create schema if not exists private;

revoke all on schema private from public, anon, authenticated;

create or replace function private.cultural_log_hanky_consent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.user_hanky_consent_events(
      user_id, signal_id, event_type, variant_id, side, visibility, occurred_at
    ) values (
      new.user_id, new.id, 'consented', new.variant_id, new.side, new.visibility, new.consented_at
    );
  elsif new.revoked_at is null and old.consented_at is distinct from new.consented_at then
    insert into public.user_hanky_consent_events(
      user_id, signal_id, event_type, variant_id, side, visibility, occurred_at
    ) values (
      new.user_id, new.id, 'consented', new.variant_id, new.side, new.visibility, new.consented_at
    );
  elsif old.revoked_at is null and new.revoked_at is not null then
    insert into public.user_hanky_consent_events(
      user_id, signal_id, event_type, variant_id, side, visibility, occurred_at
    ) values (
      new.user_id, new.id, 'revoked', new.variant_id, new.side, new.visibility, new.revoked_at
    );
  end if;
  return new;
end;
$$;

create trigger user_hanky_signals_consent_audit_trg
after insert or update of revoked_at on public.user_hanky_signals
for each row execute function private.cultural_log_hanky_consent();

create or replace function public.cultural_validate_claim_publication()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'published'
    and new.predicate = 'meaning'
    and exists (
      select 1 from public.cultural_nodes n
      where n.id = new.subject_node_id and n.artifact_kind = 'hanky_code'
    )
    and (new.geography_code is null or new.valid_from is null)
  then
    raise exception 'Published Hanky meanings require geography and validity context'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger cultural_claims_publication_guard_trg
before insert or update on public.cultural_claims
for each row execute function public.cultural_validate_claim_publication();

-- One timestamp trigger keeps every mutable graph table consistent.
create or replace function public.cultural_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'cultural_sources', 'cultural_nodes', 'cultural_variants', 'cultural_claims',
    'cultural_edges', 'cultural_assignments', 'cultural_link_proposals',
    'user_cultural_preferences', 'user_hanky_signals'
  ]
  loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.cultural_set_updated_at()',
      v_table || '_updated_at_trg', v_table
    );
  end loop;
end;
$$;

-- RLS + least-privilege grants. Reference tables are read-only to clients;
-- admins write through the CMS. Personal tables are owner-only.
alter table public.cultural_sources enable row level security;

alter table public.cultural_nodes enable row level security;

alter table public.cultural_variants enable row level security;

alter table public.cultural_claims enable row level security;

alter table public.cultural_edges enable row level security;

alter table public.cultural_assignments enable row level security;

alter table public.cultural_link_proposals enable row level security;

alter table public.user_cultural_preferences enable row level security;

alter table public.user_hanky_signals enable row level security;

alter table public.user_hanky_consent_events enable row level security;

alter table public.user_cultural_preferences force row level security;

alter table public.user_hanky_signals force row level security;

alter table public.user_hanky_consent_events force row level security;

revoke all on table
  public.cultural_sources, public.cultural_nodes, public.cultural_variants,
  public.cultural_claims, public.cultural_edges, public.cultural_assignments,
  public.cultural_link_proposals, public.user_cultural_preferences,
  public.user_hanky_signals, public.user_hanky_consent_events
from anon, authenticated;

grant select on table
  public.cultural_sources, public.cultural_nodes, public.cultural_variants,
  public.cultural_claims, public.cultural_edges, public.cultural_assignments
to anon, authenticated;

grant select, insert, update, delete on table
  public.cultural_sources, public.cultural_nodes, public.cultural_variants,
  public.cultural_claims, public.cultural_edges, public.cultural_assignments,
  public.cultural_link_proposals
to authenticated;

grant select, insert, update, delete on table
  public.user_cultural_preferences, public.user_hanky_signals
to authenticated;

grant select on table public.user_hanky_consent_events to authenticated;

create policy cultural_sources_public_read on public.cultural_sources
  for select to anon, authenticated using (true);

create policy cultural_sources_admin_all on public.cultural_sources
  for all to authenticated
  using (public.has_role_jwt('admin'::public.app_role))
  with check (public.has_role_jwt('admin'::public.app_role));

create policy cultural_nodes_public_read on public.cultural_nodes
  for select to anon, authenticated using (status = 'published');

create policy cultural_nodes_admin_all on public.cultural_nodes
  for all to authenticated
  using (public.has_role_jwt('admin'::public.app_role))
  with check (public.has_role_jwt('admin'::public.app_role));

create policy cultural_variants_public_read on public.cultural_variants
  for select to anon, authenticated using (
    status = 'published'
    and exists (
      select 1 from public.cultural_nodes n
      where n.id = cultural_variants.node_id and n.status = 'published'
    )
  );

create policy cultural_variants_admin_all on public.cultural_variants
  for all to authenticated
  using (public.has_role_jwt('admin'::public.app_role))
  with check (public.has_role_jwt('admin'::public.app_role));

create policy cultural_claims_public_read on public.cultural_claims
  for select to anon, authenticated using (
    status = 'published'
    and exists (
      select 1 from public.cultural_nodes n
      where n.id = cultural_claims.subject_node_id
        and n.status = 'published' and n.sensitivity = 'standard'
    )
  );

create policy cultural_claims_admin_all on public.cultural_claims
  for all to authenticated
  using (public.has_role_jwt('admin'::public.app_role))
  with check (public.has_role_jwt('admin'::public.app_role));

create policy cultural_edges_public_read on public.cultural_edges
  for select to anon, authenticated using (status = 'published');

create policy cultural_edges_admin_all on public.cultural_edges
  for all to authenticated
  using (public.has_role_jwt('admin'::public.app_role))
  with check (public.has_role_jwt('admin'::public.app_role));

create policy cultural_assignments_public_read on public.cultural_assignments
  for select to anon, authenticated using (status = 'approved');

create policy cultural_assignments_admin_all on public.cultural_assignments
  for all to authenticated
  using (public.has_role_jwt('admin'::public.app_role))
  with check (public.has_role_jwt('admin'::public.app_role));

create policy cultural_link_proposals_admin_all on public.cultural_link_proposals
  for all to authenticated
  using (public.has_role_jwt('admin'::public.app_role))
  with check (public.has_role_jwt('admin'::public.app_role));

create policy user_cultural_preferences_owner_all on public.user_cultural_preferences
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy user_hanky_signals_owner_all on public.user_hanky_signals
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy user_hanky_consent_events_owner_read on public.user_hanky_consent_events
  for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.export_my_cultural_data()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'preferences', (
      select to_jsonb(p) from public.user_cultural_preferences p
      where p.user_id = (select auth.uid())
    ),
    'hankySignals', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.created_at)
      from public.user_hanky_signals s where s.user_id = (select auth.uid())
    ), '[]'::jsonb),
    'hankyConsentEvents', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.occurred_at)
      from public.user_hanky_consent_events e where e.user_id = (select auth.uid())
    ), '[]'::jsonb)
  );
$$;

create or replace function public.erase_my_cultural_data()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_signal_count integer;
  v_preference_count integer;
begin
  delete from public.user_hanky_signals where user_id = (select auth.uid());
  get diagnostics v_signal_count = row_count;
  delete from public.user_cultural_preferences where user_id = (select auth.uid());
  get diagnostics v_preference_count = row_count;
  return jsonb_build_object(
    'deletedSignals', v_signal_count,
    'deletedPreferences', v_preference_count
  );
end;
$$;

-- Public graph context. security invoker is deliberate: table policies still
-- suppress adult claims and every non-published record.
create or replace function public.get_cultural_context(
  p_entity_type text,
  p_entity_id uuid,
  p_placement text default null,
  p_locale text default 'en'
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(context_row order by position, name), '[]'::jsonb)
  from (
    select
      a.position,
      coalesce(n.name_i18n ->> p_locale, n.name) as name,
      jsonb_build_object(
        'assignmentId', a.id,
        'nodeId', n.id,
        'slug', n.slug,
        'nodeKind', n.node_kind,
        'artifactKind', n.artifact_kind,
        'name', coalesce(n.name_i18n ->> p_locale, n.name),
        'description', coalesce(n.description_i18n ->> p_locale, n.description),
        'eraLabel', n.era_label,
        'sensitivity', n.sensitivity,
        'placement', a.placement,
        'rationale', a.rationale,
        'themeEligible', a.theme_eligible,
        'variant', case when v.id is null then null else jsonb_build_object(
          'id', v.id,
          'slug', v.slug,
          'label', coalesce(v.label_i18n ->> p_locale, v.label),
          'palette', v.canonical_palette,
          'renderSpec', v.render_spec,
          'theme', v.derived_theme,
          'regionCode', v.region_code
        ) end
      ) as context_row
    from public.cultural_assignments a
    join public.cultural_nodes n on n.id = a.node_id
    left join public.cultural_variants v on v.id = a.variant_id and v.status = 'published'
    where a.entity_type = p_entity_type
      and a.entity_id = p_entity_id
      and a.status = 'approved'
      and n.status = 'published'
      and (p_placement is null or a.placement = p_placement)
  ) q;
$$;

create or replace function public.explore_cultural_graph(
  p_node_id uuid,
  p_depth integer default 1,
  p_locale text default 'en'
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with recursive walk as (
    select p_node_id as node_id, 0 as depth, array[p_node_id]::uuid[] as seen
    union all
    select
      case when e.source_node_id = w.node_id then e.target_node_id else e.source_node_id end,
      w.depth + 1,
      w.seen || case when e.source_node_id = w.node_id then e.target_node_id else e.source_node_id end
    from walk w
    join public.cultural_edges e
      on (e.source_node_id = w.node_id or e.target_node_id = w.node_id)
     and e.status = 'published'
    where w.depth < least(greatest(p_depth, 0), 2)
      and not (
        case when e.source_node_id = w.node_id then e.target_node_id else e.source_node_id end
        = any(w.seen)
      )
  ), dedup as (
    select node_id, min(depth) as depth from walk group by node_id
  )
  select jsonb_build_object(
    'nodes', coalesce(jsonb_agg(jsonb_build_object(
      'id', n.id,
      'slug', n.slug,
      'name', coalesce(n.name_i18n ->> p_locale, n.name),
      'nodeKind', n.node_kind,
      'artifactKind', n.artifact_kind,
      'eraLabel', n.era_label,
      'depth', d.depth
    ) order by d.depth, n.name), '[]'::jsonb)
  )
  from dedup d
  join public.cultural_nodes n on n.id = d.node_id and n.status = 'published';
$$;

revoke execute on function public.cultural_set_updated_at() from public, anon, authenticated;

revoke execute on function private.cultural_log_hanky_consent() from public, anon, authenticated;

revoke execute on function public.cultural_validate_claim_publication() from public, anon, authenticated;

revoke execute on function public.get_cultural_context(text, uuid, text, text) from public;

revoke execute on function public.explore_cultural_graph(uuid, integer, text) from public;

revoke execute on function public.export_my_cultural_data() from public;

revoke execute on function public.erase_my_cultural_data() from public;

grant execute on function public.get_cultural_context(text, uuid, text, text) to anon, authenticated;

grant execute on function public.explore_cultural_graph(uuid, integer, text) to anon, authenticated;

grant execute on function public.export_my_cultural_data() to authenticated;

grant execute on function public.erase_my_cultural_data() to authenticated;

comment on table public.cultural_nodes is
  'First-class visual-culture nodes. Identity and historical participation are never inferred.';

comment on table public.cultural_link_proposals is
  'Suggestions only. A proposal is never public until an editor creates an approved assignment.';

comment on table public.user_hanky_signals is
  'Owner-managed adult signals. No anon table grant; public-adult reads go through the age-attested Pages Function.';

-- Standard cultural references participate in the global search corpus.
-- Adult nodes are deliberately excluded: search_documents powers anonymous
-- search, autocomplete, feeds and previews, none of which may leak Hanky data.
create or replace function public.search_documents_index_cultural_nodes(p_id uuid default null)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.search_documents (
    doc_id, entity_type, entity_id, title, description, search_tsv, facets,
    liveness_status, is_featured, slug, content_language, updated_at
  )
  select
    'cultural_node:' || n.id,
    'cultural_node',
    n.id,
    n.name,
    n.description,
       setweight(to_tsvector('simple', extensions.unaccent(coalesce(n.name, ''))), 'A')
    || setweight(to_tsvector('simple', extensions.unaccent(coalesce(n.era_label, ''))), 'B')
    || setweight(to_tsvector('simple', extensions.unaccent(coalesce(n.description, ''))), 'D'),
    jsonb_strip_nulls(jsonb_build_object(
      'category', n.artifact_kind,
      'node_kind', n.node_kind,
      'artifact_kind', n.artifact_kind,
      'era_label', n.era_label
    )),
    'live', false, n.slug, 'en', now()
  from public.cultural_nodes n
  where n.status = 'published'
    and n.sensitivity = 'standard'
    and (p_id is null or n.id = p_id)
  on conflict (entity_type, entity_id) do update set
    title = excluded.title,
    description = excluded.description,
    search_tsv = excluded.search_tsv,
    facets = excluded.facets,
    liveness_status = excluded.liveness_status,
    slug = excluded.slug,
    updated_at = now();
$$;

create or replace function private.search_documents_sync_cultural_node()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    delete from public.search_documents
    where entity_type = 'cultural_node'
      and entity_id = coalesce(new.id, old.id);
    if tg_op <> 'DELETE' then
      perform public.search_documents_index_cultural_nodes(new.id);
    end if;
  exception when others then
    -- Search freshness must never abort editorial publication.
    null;
  end;
  return coalesce(new, old);
end;
$$;

create trigger cultural_nodes_search_documents_trg
after insert or update or delete on public.cultural_nodes
for each row execute function private.search_documents_sync_cultural_node();

select public.search_documents_index_cultural_nodes(null);

revoke execute on function public.search_documents_index_cultural_nodes(uuid)
  from public, anon, authenticated;

revoke execute on function private.search_documents_sync_cultural_node()
  from public, anon, authenticated;

-- Seed sources describe migration provenance. Editorial source tooling can
-- attach stronger community/designer/archive sources without changing slugs.
insert into public.cultural_sources (slug, title, source_kind, attribution, metadata)
values
  ('existing-pride-flag-registry', 'Queer Guide curated pride-flag registry', 'internal_reference',
   'Previously verified against community/designer specifications', '{"migratedFrom":"src/lib/flags/prideFlags.ts"}'),
  ('townsend-1983-hanky-core', 'The Leatherman''s Handbook II (1983)', 'publication', 'Larry Townsend',
   '{"migratedFrom":"src/lib/flags/hankyCode.ts"}'),
  ('queer-guide-historic-symbol-reference', 'Queer Guide historic-symbol design reference', 'internal_reference',
   'Requires ongoing archive-level corroboration', '{"sourceArtifact":"Historic Symbols.dc.html"}'),
  ('queer-guide-wayfinding-reference', 'Queer Guide wayfinding icon system', 'internal_reference',
   'Product design vocabulary', '{"migratedFrom":"src/components/transit/transitIconPaths.ts"}')
on conflict (slug) do nothing;

with flag_rows(slug, name) as (values
  ('rainbow-pride', 'Rainbow Pride Flag'),
  ('progress-pride', 'Progress Pride Flag'),
  ('transgender-pride', 'Transgender Pride Flag'),
  ('bisexual-pride', 'Bisexual Pride Flag'),
  ('pansexual-pride', 'Pansexual Pride Flag'),
  ('lesbian-pride', 'Lesbian Pride Flag'),
  ('gay-men-pride', 'Gay Men''s Pride Flag'),
  ('nonbinary-pride', 'Non-Binary Pride Flag'),
  ('genderfluid-pride', 'Genderfluid Pride Flag'),
  ('genderqueer-pride', 'Genderqueer Pride Flag'),
  ('agender-pride', 'Agender Pride Flag'),
  ('asexual-pride', 'Asexual Pride Flag'),
  ('aromantic-pride', 'Aromantic Pride Flag'),
  ('demisexual-pride', 'Demisexual Pride Flag'),
  ('intersex-pride', 'Intersex Pride Flag'),
  ('leather-pride', 'Leather Pride Flag'),
  ('bear-brotherhood', 'Bear Brotherhood Flag')
)
insert into public.cultural_nodes (
  slug, node_kind, artifact_kind, name, status, last_verified_at, metadata
)
select slug, 'artifact', 'flag', name, 'published', now(),
       jsonb_build_object('registryId', slug)
from flag_rows
on conflict (slug) do update set
  name = excluded.name,
  metadata = public.cultural_nodes.metadata || excluded.metadata;

with flag_palettes(slug, palette) as (values
  ('rainbow-pride', '["#E50000","#FF8D00","#FFEE00","#028121","#004CFF","#770088"]'::jsonb),
  ('progress-pride', '["#FFFFFF","#FFAFC8","#74D7EE","#613915","#000000","#E50000","#FF8D00","#FFEE00","#028121","#004CFF","#770088"]'::jsonb),
  ('transgender-pride', '["#5BCEFA","#F5A9B8","#FFFFFF","#F5A9B8","#5BCEFA"]'::jsonb),
  ('bisexual-pride', '["#D60270","#9B4F96","#0038A8"]'::jsonb),
  ('pansexual-pride', '["#FF218C","#FFD800","#21B1FF"]'::jsonb),
  ('lesbian-pride', '["#D52D00","#EF7627","#FF9A56","#FFFFFF","#D162A4","#B55690","#A30262"]'::jsonb),
  ('gay-men-pride', '["#078D70","#26CEAA","#98E8C1","#FFFFFF","#7BADE2","#5049CC","#3D1A78"]'::jsonb),
  ('nonbinary-pride', '["#FFF433","#FFFFFF","#9B59D0","#2D2D2D"]'::jsonb),
  ('genderfluid-pride', '["#FF75A2","#F5F5F5","#BE18D6","#2C2C2C","#333EBD"]'::jsonb),
  ('genderqueer-pride', '["#B57EDC","#FFFFFF","#4A8123"]'::jsonb),
  ('agender-pride', '["#000000","#B9B9B9","#FFFFFF","#B8F483","#FFFFFF","#B9B9B9","#000000"]'::jsonb),
  ('asexual-pride', '["#000000","#A3A3A3","#FFFFFF","#800080"]'::jsonb),
  ('aromantic-pride', '["#3DA542","#A7D379","#FFFFFF","#A9A9A9","#000000"]'::jsonb),
  ('demisexual-pride', '["#000000","#FFFFFF","#6E0070","#D2D2D2"]'::jsonb),
  ('intersex-pride', '["#7902AA","#FFD800"]'::jsonb),
  ('leather-pride', '["#E70039","#000000","#2A2A7F","#000000","#2A2A7F","#FFFFFF","#2A2A7F","#000000","#2A2A7F","#000000"]'::jsonb),
  ('bear-brotherhood', '["#000000","#623804","#D56300","#FEDD63","#FEE6B8","#FFFFFF","#555555","#000000"]'::jsonb)
)
insert into public.cultural_variants (
  node_id, source_id, slug, label, canonical_palette, render_spec, status
)
select n.id, s.id, 'canonical', 'Canonical', p.palette,
       jsonb_build_object('renderer', 'pride-flag-registry', 'registryId', n.metadata ->> 'registryId'),
       'published'
from public.cultural_nodes n
join flag_palettes p on p.slug = n.slug
cross join public.cultural_sources s
where n.artifact_kind = 'flag'
  and s.slug = 'existing-pride-flag-registry'
on conflict (node_id, slug) do nothing;

with concept_rows(slug, name, icon_name) as (values
  ('wayfinding-search', 'Search', 'search'),
  ('wayfinding-nearby', 'Near you', 'near-you'),
  ('wayfinding-route', 'Route', 'route'),
  ('wayfinding-saved', 'Saved', 'saved'),
  ('wayfinding-event', 'Events', 'events'),
  ('wayfinding-community', 'Community', 'community'),
  ('wayfinding-health', 'Health', 'health'),
  ('wayfinding-filter', 'Filter', 'filter'),
  ('wayfinding-map', 'Map', 'map'),
  ('wayfinding-nightlife', 'Nightlife', 'nightlife'),
  ('wayfinding-history', 'History and library', 'library'),
  ('wayfinding-profile', 'Profile', 'profile'),
  ('wayfinding-alert', 'Alerts', 'alerts'),
  ('wayfinding-source', 'Sources and documents', 'documents'),
  ('wayfinding-share', 'Share', 'share'),
  ('wayfinding-pride', 'Pride', 'pride'),
  ('wayfinding-consent', 'Consent', 'consent'),
  ('wayfinding-aftercare', 'Aftercare', 'aftercare')
)
insert into public.cultural_nodes (
  slug, node_kind, artifact_kind, name, status, last_verified_at, metadata
)
select slug, 'artifact', 'wayfinding_concept', name, 'published', now(),
       jsonb_build_object('iconName', icon_name)
from concept_rows
on conflict (slug) do update set metadata = public.cultural_nodes.metadata || excluded.metadata;

insert into public.cultural_variants (
  node_id, source_id, slug, label, render_spec, status
)
select n.id, s.id, 'canonical', n.name,
       jsonb_build_object('renderer', 'transit-icon', 'iconName', n.metadata ->> 'iconName'),
       'published'
from public.cultural_nodes n
cross join public.cultural_sources s
where n.artifact_kind = 'wayfinding_concept'
  and s.slug = 'queer-guide-wayfinding-reference'
on conflict (node_id, slug) do nothing;

with hanky_rows(slug, name) as (values
  ('hanky-black', 'Black'), ('hanky-grey', 'Grey'), ('hanky-navy', 'Navy blue'),
  ('hanky-light-blue', 'Light blue'), ('hanky-red', 'Red'), ('hanky-yellow', 'Yellow'),
  ('hanky-brown', 'Brown'), ('hanky-green', 'Kelly green'), ('hanky-orange', 'Orange'),
  ('hanky-purple', 'Purple'), ('hanky-white', 'White'), ('hanky-pink', 'Pink'),
  ('hanky-fuchsia', 'Fuchsia'), ('hanky-lavender', 'Lavender'),
  ('hanky-charcoal', 'Charcoal'), ('hanky-hunter-green', 'Hunter green')
)
insert into public.cultural_nodes (
  slug, node_kind, artifact_kind, name, sensitivity, status, last_verified_at, metadata
)
select slug, 'artifact', 'hanky_code', name || ' hanky', 'adult', 'published', now(),
       jsonb_build_object('registryId', replace(slug, 'hanky-', ''))
from hanky_rows
on conflict (slug) do update set metadata = public.cultural_nodes.metadata || excluded.metadata;

insert into public.cultural_variants (
  node_id, source_id, slug, label, render_spec, status
)
select n.id, s.id, 'canonical', n.name,
       jsonb_build_object('renderer', 'hanky-registry', 'registryId', n.metadata ->> 'registryId'),
       'published'
from public.cultural_nodes n
cross join public.cultural_sources s
where n.artifact_kind = 'hanky_code'
  and s.slug = 'townsend-1983-hanky-core'
on conflict (node_id, slug) do nothing;

with meaning_rows(registry_id, meaning) as (values
  ('black', 'Heavy S&M'), ('grey', 'Bondage'), ('navy', 'Anal sex'),
  ('light-blue', 'Oral sex'), ('red', 'Fisting'), ('yellow', 'Watersports'),
  ('brown', 'Scat'), ('green', 'Hustling — sex for money'),
  ('orange', 'Anything goes'), ('purple', 'Piercing'), ('white', 'Masturbation'),
  ('pink', 'Dildo play'), ('fuchsia', 'Spanking'), ('lavender', 'Drag'),
  ('charcoal', 'Rubber and latex'), ('hunter-green', 'Daddy / boy dynamics')
)
insert into public.cultural_claims (
  subject_node_id, source_id, predicate, value_text, geography_code, valid_from, status, reviewed_at
)
select n.id, s.id, 'meaning', m.meaning, 'US', '1970-01-01', 'published', now()
from meaning_rows m
join public.cultural_nodes n
  on n.artifact_kind = 'hanky_code' and n.metadata ->> 'registryId' = m.registry_id
cross join public.cultural_sources s
where s.slug = 'townsend-1983-hanky-core';

with symbol_rows(slug, name, era, description) as (values
  ('pink-triangle', 'Pink triangle', '1940s · reclaimed 1970s', 'A camp badge reclaimed as a protest mark.'),
  ('black-triangle', 'Black triangle', '1940s · reclaimed', 'A badge reclaimed as a mark of lesbian pride and solidarity.'),
  ('lambda', 'Lambda', '1970', 'Chosen by the New York Gay Activists Alliance as a symbol of energy and change.'),
  ('interlocking-gender-signs', 'Interlocking gender signs', 'Antiquity', 'Combined gender signs used for queer identities and relationships.'),
  ('labrys', 'Labrys', '1970s', 'A double-headed axe adopted as a lesbian-feminist emblem.'),
  ('biangles', 'Biangles', '1980s', 'Overlapping triangles used as a bisexual emblem.'),
  ('hanky-code', 'Hanky code', '1970s', 'Bandana colour and pocket side used as a scene signal.'),
  ('freedom-rings', 'Freedom rings', '1991', 'Six rings representing the colors of the rainbow flag.'),
  ('ace-ring', 'Ace ring', '2000s', 'A black ring worn on the right middle finger as an asexual signal.'),
  ('violets', 'Violets', 'Antiquity', 'A flower associated with Sappho and women''s desire.'),
  ('green-carnation', 'Green carnation', '1890s', 'A flower read as a signal after Oscar Wilde''s circle wore it.'),
  ('pansy', 'Pansy', '1920s–30s · 2005', 'A reclaimed nightlife term and later memorial symbol.'),
  ('lavender', 'Lavender', '1950s · reclaimed 1969', 'A color used against queer people and reclaimed by the movement.'),
  ('lavender-rhinoceros', 'Lavender rhinoceros', '1974 · Boston', 'A visibility symbol created for a Boston public campaign.'),
  ('safe-space-triangle', 'Safe-space triangle', '1990s', 'A mark used to identify rooms intended as safer spaces.')
)
insert into public.cultural_nodes (
  slug, node_kind, artifact_kind, name, description, era_label, sensitivity, status, last_verified_at
)
select slug, 'artifact', 'historic_symbol', name, description, era,
       case when slug = 'hanky-code' then 'adult' else 'standard' end,
       'published', now()
from symbol_rows
on conflict (slug) do update set
  era_label = excluded.era_label,
  description = excluded.description;

insert into public.cultural_variants (
  node_id, source_id, slug, label, render_spec, status
)
select n.id, s.id, 'canonical', n.name,
       jsonb_build_object('renderer', 'historic-symbol', 'symbolId', n.slug),
       'published'
from public.cultural_nodes n
cross join public.cultural_sources s
where n.artifact_kind = 'historic_symbol'
  and s.slug = 'queer-guide-historic-symbol-reference'
on conflict (node_id, slug) do nothing;

insert into public.cultural_claims (
  subject_node_id, source_id, predicate, value_text, valid_from, status, reviewed_at
)
select n.id, s.id, 'historical_summary', n.description,
       case
         when substring(n.era_label from '[0-9]{4}') is not null
           then make_date(substring(n.era_label from '[0-9]{4}')::integer, 1, 1)
         else null
       end,
       'published', now()
from public.cultural_nodes n
cross join public.cultural_sources s
where n.artifact_kind = 'historic_symbol'
  and s.slug = 'queer-guide-historic-symbol-reference';
