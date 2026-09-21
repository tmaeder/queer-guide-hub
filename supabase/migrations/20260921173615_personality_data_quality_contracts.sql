-- Personality data-quality contracts, cohort-aware scoring and canonical read model.
-- Design: docs/plans/2026-09-21-personality-data-quality-remediation-design.md

begin;
set local statement_timeout = '600s';
select set_config('app.actor', 'migration:personality-data-quality-contracts', true);

-- ---------------------------------------------------------------------------
-- 1. Compatibility columns with explicit state instead of sentinel values.
-- ---------------------------------------------------------------------------

alter table public.personalities
  add column if not exists wikidata_status text,
  add column if not exists quality_score_version smallint not null default 2,
  add column if not exists quality_dimensions jsonb not null default '{}'::jsonb,
  add column if not exists quality_evaluated_at timestamptz,
  add column if not exists image_status text not null default 'pending';

alter table public.personalities
  drop constraint if exists personalities_wikidata_status_check,
  add constraint personalities_wikidata_status_check check (
    wikidata_status is null or wikidata_status in
      ('resolved','not_found','not_applicable','needs_review')
  ),
  drop constraint if exists personalities_image_status_check,
  add constraint personalities_image_status_check check (
    image_status in ('pending','available','unavailable','rejected','needs_review')
  );

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.personality_remediation_audit (
  id bigint generated always as identity primary key,
  batch_key text not null,
  personality_id uuid not null references public.personalities(id) on delete cascade,
  field_name text not null,
  old_value jsonb,
  new_value jsonb,
  reason text not null,
  changed_at timestamptz not null default now(),
  unique (batch_key, personality_id, field_name)
);
revoke all on table private.personality_remediation_audit from public, anon, authenticated;

-- Preserve every legacy sentinel before clearing it from the identifier column.
insert into private.personality_remediation_audit
  (batch_key, personality_id, field_name, old_value, new_value, reason)
select 'personality-qid-sentinel-v1', id, 'wikidata_qid', to_jsonb(wikidata_qid), null,
       'SKIP_* is workflow state, not a Wikidata identifier'
from public.personalities
where wikidata_qid like 'SKIP_%'
on conflict do nothing;

update public.personalities
set wikidata_status = case
      when wikidata_qid ~ '^Q[0-9]+$' then 'resolved'
      when wikidata_qid like 'SKIP_%' then 'not_found'
      else coalesce(wikidata_status, 'needs_review')
    end,
    wikidata_qid = case when wikidata_qid like 'SKIP_%' then null else wikidata_qid end
where wikidata_status is null or wikidata_qid like 'SKIP_%';

alter table public.personalities
  alter column wikidata_status set default 'needs_review',
  alter column wikidata_status set not null,
  drop constraint if exists personalities_wikidata_qid_format_check,
  add constraint personalities_wikidata_qid_format_check
    check (wikidata_qid is null or wikidata_qid ~ '^Q[0-9]+$') not valid,
  drop constraint if exists personalities_life_dates_coherent_check,
  add constraint personalities_life_dates_coherent_check check (
    (birth_date is null or death_date is null or birth_date <= death_date)
    and not (coalesce(is_living, false) and death_date is not null)
  ) not valid;

alter table public.personalities validate constraint personalities_wikidata_qid_format_check;
alter table public.personalities validate constraint personalities_life_dates_coherent_check;

-- Existing duplicate summaries are remediated in reviewed batches. A
-- column-specific trigger rejects new copies without making unrelated updates
-- to legacy rows fail.
create or replace function public.enforce_personality_summary_contract()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.description is not null and new.bio is not null
     and lower(regexp_replace(btrim(new.description), '\s+', ' ', 'g'))
         = lower(regexp_replace(btrim(new.bio), '\s+', ' ', 'g')) then
    raise exception 'personality description must not duplicate bio'
      using errcode='23514';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_personality_summary_contract()
  from public, anon, authenticated;
drop trigger if exists trg_personality_summary_contract on public.personalities;
create trigger trg_personality_summary_contract
  before insert or update of description, bio on public.personalities
  for each row execute function public.enforce_personality_summary_contract();

-- ---------------------------------------------------------------------------
-- 2. Normalize claims, affiliations, adult attributes, and event links.
-- ---------------------------------------------------------------------------

create table if not exists public.personality_claim_sources (
  id uuid primary key default gen_random_uuid(),
  personality_id uuid not null references public.personalities(id) on delete cascade,
  field_name text not null,
  source_id uuid not null references public.personality_sources(id) on delete cascade,
  confidence numeric(4,3) check (confidence is null or confidence between 0 and 1),
  verification_status text not null default 'pending'
    check (verification_status in ('pending','verified','disputed','rejected')),
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (personality_id, field_name, source_id)
);
create index if not exists personality_claim_sources_person_field_idx
  on public.personality_claim_sources(personality_id, field_name, verification_status);

create table if not exists public.personality_affiliations (
  id uuid primary key default gen_random_uuid(),
  personality_id uuid not null references public.personalities(id) on delete cascade,
  affiliation_type text not null check (affiliation_type in
    ('political_party','organization','institution','movement','other')),
  name text not null check (length(btrim(name)) between 1 and 300),
  canonical_entity_id uuid,
  source_id uuid references public.personality_sources(id) on delete set null,
  start_date date,
  end_date date,
  verification_status text not null default 'pending'
    check (verification_status in ('pending','verified','disputed','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (personality_id, affiliation_type, name)
);
create index if not exists personality_affiliations_person_idx
  on public.personality_affiliations(personality_id);

create table if not exists public.personality_adult_attributes (
  personality_id uuid not null references public.personalities(id) on delete cascade,
  vocabulary text not null,
  attribute_code text not null,
  display_value text not null,
  source_id uuid references public.personality_sources(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (personality_id, vocabulary, attribute_code)
);

create table if not exists public.personality_tag_review_queue (
  id uuid primary key default gen_random_uuid(),
  personality_id uuid not null references public.personalities(id) on delete cascade,
  raw_value text not null,
  normalized_value text not null,
  source text,
  status text not null default 'open' check (status in ('open','approved','rejected','superseded')),
  canonical_tag_id uuid references public.unified_tags(id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (personality_id, normalized_value)
);
create index if not exists personality_tag_review_open_idx
  on public.personality_tag_review_queue(status, created_at) where status = 'open';

create table if not exists public.event_personality_links (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  personality_id uuid not null references public.personalities(id) on delete cascade,
  source text not null default 'entity_link_review',
  confidence numeric(4,3) check (confidence is null or confidence between 0 and 1),
  citations jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (event_id, personality_id)
);
create index if not exists event_personality_links_person_idx
  on public.event_personality_links(personality_id, status, created_at desc);

alter table public.personality_claim_sources enable row level security;
alter table public.personality_affiliations enable row level security;
alter table public.personality_adult_attributes enable row level security;
alter table public.personality_tag_review_queue enable row level security;
alter table public.event_personality_links enable row level security;

do $$ begin
  create policy personality_claim_sources_admin_read on public.personality_claim_sources
    for select to authenticated
    using (has_any_role_jwt(array['admin'::app_role,'moderator'::app_role]));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy personality_affiliations_admin_read on public.personality_affiliations
    for select to authenticated
    using (has_any_role_jwt(array['admin'::app_role,'moderator'::app_role]));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy personality_adult_attributes_admin_read on public.personality_adult_attributes
    for select to authenticated
    using (has_any_role_jwt(array['admin'::app_role,'moderator'::app_role]));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy personality_tag_review_admin_read on public.personality_tag_review_queue
    for select to authenticated
    using (has_any_role_jwt(array['admin'::app_role,'moderator'::app_role]));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy event_personality_links_public_read on public.event_personality_links
    for select to anon, authenticated using (status = 'approved');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy event_personality_links_admin_read on public.event_personality_links
    for select to authenticated
    using (has_any_role_jwt(array['admin'::app_role,'moderator'::app_role]));
exception when duplicate_object then null; end $$;

-- Editors need to resolve queues and attach reviewed provenance. Public clients
-- retain read-only access through the narrower policies above.
do $$
declare v_table text;
begin
  foreach v_table in array array[
    'personality_claim_sources','personality_affiliations',
    'personality_adult_attributes','personality_tag_review_queue',
    'event_personality_links'
  ] loop
    if not exists (
      select 1 from pg_policies
      where schemaname='public' and tablename=v_table
        and policyname=v_table || '_admin_manage'
    ) then
      execute format(
        'create policy %I on public.%I for all to authenticated using '
        || '(has_any_role_jwt(array[''admin''::app_role,''moderator''::app_role])) '
        || 'with check (has_any_role_jwt(array[''admin''::app_role,''moderator''::app_role]))',
        v_table || '_admin_manage', v_table
      );
    end if;
  end loop;
end $$;

revoke all on public.personality_claim_sources, public.personality_affiliations,
  public.personality_adult_attributes, public.personality_tag_review_queue,
  public.event_personality_links from public, anon, authenticated;
grant select on public.personality_claim_sources, public.personality_affiliations,
  public.personality_adult_attributes, public.personality_tag_review_queue
  to authenticated;
grant select on public.event_personality_links to anon, authenticated;
grant insert, update, delete on public.personality_claim_sources, public.personality_affiliations,
  public.personality_adult_attributes, public.personality_tag_review_queue,
  public.event_personality_links to authenticated;
grant all on public.personality_claim_sources, public.personality_affiliations,
  public.personality_adult_attributes, public.personality_tag_review_queue,
  public.event_personality_links to service_role;

-- Preserve and normalize party objects that leaked into the presentation-only
-- fields JSON array. String values stay in place for compatibility.
insert into public.personality_affiliations
  (personality_id, affiliation_type, name, verification_status)
select distinct p.id, 'political_party', btrim(party.value), 'pending'
from public.personalities p
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(coalesce(p.fields, '[]'::jsonb)) = 'array'
       then coalesce(p.fields, '[]'::jsonb) else '[]'::jsonb end
) field(value)
cross join lateral jsonb_array_elements_text(
  case when jsonb_typeof(field.value) = 'object'
             and jsonb_typeof(field.value->'parties') = 'array'
       then field.value->'parties' else '[]'::jsonb end
) party(value)
where btrim(party.value) <> ''
on conflict do nothing;

insert into private.personality_remediation_audit
  (batch_key, personality_id, field_name, old_value, new_value, reason)
select 'personality-fields-objects-v1', p.id, 'fields', p.fields,
       coalesce((select jsonb_agg(v.value order by v.ord)
                 from jsonb_array_elements(p.fields) with ordinality v(value, ord)
                 where jsonb_typeof(v.value) = 'string'), '[]'::jsonb),
       'object values migrated to personality_affiliations'
from public.personalities p
where jsonb_typeof(coalesce(p.fields, '[]'::jsonb)) = 'array'
  and exists (select 1 from jsonb_array_elements(p.fields) v(value)
              where jsonb_typeof(v.value) <> 'string')
on conflict do nothing;

update public.personalities p
set fields = a.new_value, updated_at = now()
from private.personality_remediation_audit a
where a.batch_key = 'personality-fields-objects-v1'
  and a.personality_id = p.id and a.field_name = 'fields';

create or replace function public.personality_fields_are_strings(p_fields jsonb)
returns boolean language sql immutable parallel safe
set search_path = public, pg_temp
as $$
  select p_fields is null or (
    jsonb_typeof(p_fields) = 'array'
    and not exists (
      select 1 from jsonb_array_elements(p_fields) v(value)
      where jsonb_typeof(v.value) <> 'string'
    )
  );
$$;
revoke all on function public.personality_fields_are_strings(jsonb) from public, anon, authenticated;
grant execute on function public.personality_fields_are_strings(jsonb) to service_role;

alter table public.personalities
  drop constraint if exists personalities_fields_strings_only_check,
  add constraint personalities_fields_strings_only_check
    check (public.personality_fields_are_strings(fields)) not valid;
alter table public.personalities validate constraint personalities_fields_strings_only_check;

create or replace function public.normalize_personality_data_contract()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.wikidata_qid is not null then
    new.wikidata_qid := upper(btrim(new.wikidata_qid));
    new.wikidata_status := case when new.wikidata_qid ~ '^Q[0-9]+$'
      then 'resolved' else 'needs_review' end;
  elsif new.wikidata_status = 'resolved' then
    new.wikidata_status := 'needs_review';
  end if;
  if new.image_url is not null and (
    new.image_url ~* '/(default|users/default)/.*male\\.jpg'
    or new.image_url ~* '(drag.race|season).*(poster|promotional[_ -]?photo)'
  ) then
    new.image_url := null;
    new.image_status := 'rejected';
  elsif new.image_url is not null and new.image_status = 'pending' then
    new.image_status := 'needs_review';
  end if;
  return new;
end;
$$;
revoke all on function public.normalize_personality_data_contract() from public, anon, authenticated;
drop trigger if exists trg_normalize_personality_data_contract on public.personalities;
create trigger trg_normalize_personality_data_contract
  before insert or update of wikidata_qid, wikidata_status, image_url, image_status
  on public.personalities for each row
  execute function public.normalize_personality_data_contract();

-- Commit normalized structured fields after the canonical staging RPC has
-- attached its target personality. This avoids restating that large atomic RPC.
create or replace function public.sync_personality_staging_contract()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_aff jsonb; v_source_id uuid; v_aff_name text; v_attr text;
begin
  if new.target_table <> 'personalities' or new.target_record_id is null
     or new.disposition not in ('inserted','updated','committed') then
    return new;
  end if;
  select s.id into v_source_id from public.personality_sources s
  where s.personality_id=new.target_record_id
  order by s.is_primary desc nulls last, s.last_seen_at desc nulls last limit 1;

  for v_aff in select value from jsonb_array_elements(
    case when jsonb_typeof(new.normalized_data->'affiliations')='array'
      then new.normalized_data->'affiliations' else '[]'::jsonb end
  ) loop
    v_aff_name := nullif(btrim(v_aff->>'name'),'');
    if v_aff_name is null then
      continue;
    end if;
    insert into public.personality_affiliations
      (personality_id, affiliation_type, name, source_id)
    values (new.target_record_id,
      coalesce(nullif(v_aff->>'affiliation_type',''),'other'),
      v_aff_name, v_source_id)
    on conflict do nothing;
  end loop;
  for v_attr in select value from jsonb_array_elements_text(
    case when jsonb_typeof(new.normalized_data->'adult_attributes')='array'
      then new.normalized_data->'adult_attributes' else '[]'::jsonb end
  ) loop
    if btrim(v_attr) <> '' then
      insert into public.personality_adult_attributes
        (personality_id, vocabulary, attribute_code, display_value, source_id)
      values (
        new.target_record_id, 'source-platform',
        coalesce(nullif(trim(both '-' from regexp_replace(lower(btrim(v_attr)), '[^a-z0-9]+', '-', 'g')),''),
          'source-' || substr(md5(v_attr),1,12)),
        btrim(v_attr), v_source_id
      ) on conflict do nothing;
    end if;
  end loop;
  update public.personalities p set
    wikidata_status=coalesce(nullif(new.normalized_data->>'wikidata_status',''),p.wikidata_status),
    image_status=coalesce(nullif(new.normalized_data->>'image_status',''),p.image_status)
  where p.id=new.target_record_id;
  return new;
end;
$$;
revoke all on function public.sync_personality_staging_contract() from public, anon, authenticated;
drop trigger if exists trg_sync_personality_staging_contract on public.ingestion_staging;
create trigger trg_sync_personality_staging_contract
  after update of disposition, target_record_id on public.ingestion_staging
  for each row when (new.target_record_id is not null)
  execute function public.sync_personality_staging_contract();

-- Adult platform categories stay queryable for editors but no longer need to
-- masquerade as the general editorial tag vocabulary.
insert into public.personality_adult_attributes
  (personality_id, vocabulary, attribute_code, display_value)
select p.id, 'legacy-platform',
       coalesce(nullif(trim(both '-' from regexp_replace(lower(btrim(t.value)), '[^a-z0-9]+', '-', 'g')),''),
         'legacy-' || substr(md5(t.value),1,12)),
       btrim(t.value)
from public.personalities p
cross join lateral unnest(coalesce(p.tags, '{}'::text[])) t(value)
where p.is_adult and btrim(t.value) <> ''
on conflict do nothing;

-- Queue unresolved non-adult values; approved canonical assignments remain in
-- tag_assignments_norm and are the only values exposed by the public read model.
insert into public.personality_tag_review_queue
  (personality_id, raw_value, normalized_value, source)
select p.id, btrim(t.value), lower(btrim(t.value)), 'legacy-personalities.tags'
from public.personalities p
cross join lateral unnest(coalesce(p.tags, '{}'::text[])) t(value)
where not p.is_adult and btrim(t.value) <> ''
  and not exists (
    select 1 from public.unified_tags u
    where u.status = 'active' and u.merged_into_id is null
      and (lower(u.slug) = lower(btrim(t.value)) or lower(u.name) = lower(btrim(t.value)))
  )
  and not exists (
    select 1 from public.tag_aliases a
    join public.unified_tags u on u.id = a.canonical_tag_id
    where u.status = 'active' and u.merged_into_id is null
      and lower(a.alias_name) = lower(btrim(t.value))
  )
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 3. Image state and canonical public read model.
-- ---------------------------------------------------------------------------

insert into private.personality_remediation_audit
  (batch_key, personality_id, field_name, old_value, new_value, reason)
select 'personality-placeholder-images-v1', p.id, 'image_url', to_jsonb(p.image_url), null,
       'shared default avatar or season artwork is not a verified portrait'
from public.personalities p
where p.image_url is not null and (
  p.image_url ~* '/(default|users/default)/.*male\\.jpg'
  or p.image_url ~* '(drag.race|season).*(poster|promotional[_ -]?photo)'
)
on conflict do nothing;

update public.personalities p
set image_url = null, image_status = 'rejected', updated_at = now()
from private.personality_remediation_audit a
where a.batch_key = 'personality-placeholder-images-v1'
  and a.personality_id = p.id and a.field_name = 'image_url';

update public.personalities p
set image_status = case
  when p.image_status = 'rejected' then 'rejected'
  when exists (
    select 1 from public.image_asset_links l
    join public.image_assets a on a.id = l.asset_id
    where l.entity_type = 'personality' and l.entity_id = p.id and l.role = 'cover'
      and a.status = 'active'
      and a.optimization_status in ('optimized','cdn_optimized')
      and coalesce(a.optimized_url, a.thumbnail_url) is not null
  ) then 'available'
  when p.image_url is not null then 'needs_review'
  else 'pending'
end;

create or replace view public.personality_public_profiles
with (security_invoker = true) as
select p.*,
  coalesce(img.optimized_url, img.thumbnail_url,
           case when p.image_status not in ('rejected','unavailable') then p.image_url end)
    as resolved_image_url,
  coalesce(tags.canonical_tags, '{}'::text[]) as canonical_tags,
  greatest(cardinality(coalesce(p.tags, '{}'::text[]))
    - cardinality(coalesce(tags.canonical_tags, '{}'::text[])), 0) as unresolved_tag_count
from public.personalities p
left join lateral (
  select a.optimized_url, a.thumbnail_url
  from public.image_asset_links l
  join public.image_assets a on a.id = l.asset_id
  where l.entity_type = 'personality' and l.entity_id = p.id and l.role = 'cover'
    and a.status = 'active'
    and a.optimization_status in ('optimized','cdn_optimized')
  order by l.sort_order, l.added_at desc
  limit 1
) img on true
left join lateral (
  with resolved as (
    select u.slug
    from unnest(coalesce(p.tags, '{}'::text[])) raw(value)
    join public.unified_tags u
      on u.status = 'active' and u.merged_into_id is null
     and (lower(u.slug) = lower(btrim(raw.value)) or lower(u.name) = lower(btrim(raw.value)))
    union
    select u.slug
    from unnest(coalesce(p.tags, '{}'::text[])) raw(value)
    join public.tag_aliases a on lower(a.alias_name) = lower(btrim(raw.value))
    join public.unified_tags u on u.id = a.canonical_tag_id
    where u.status = 'active' and u.merged_into_id is null
    union
    select u.slug
    from public.tag_assignments_norm ta
    join public.unified_tags u on u.id = ta.tag_id
    where ta.entity_type = 'personality' and ta.entity_id = p.id
      and u.status = 'active' and u.merged_into_id is null
  )
  select array_agg(distinct slug order by slug) as canonical_tags
  from resolved
) tags on true
where p.visibility = 'public' and p.duplicate_of_id is null
  and coalesce(p.review_status, '') not in ('archived','rejected');

revoke all on public.personality_public_profiles from public;
grant select on public.personality_public_profiles to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Cohort-aware quality dimensions and publication failures.
-- ---------------------------------------------------------------------------

create or replace function public.personality_publication_failures(p_id uuid)
returns text[]
language sql stable security invoker
set search_path = public, pg_temp
as $$
  select array_remove(array[
    case when p.duplicate_of_id is not null then 'duplicate' end,
    case when coalesce(p.review_status,'') in ('archived','rejected') then 'inactive' end,
    case when p.wikidata_status = 'resolved' and p.wikidata_qid is null then 'wikidata_state_mismatch' end,
    case when p.wikidata_qid is not null and p.wikidata_qid !~ '^Q[0-9]+$' then 'invalid_wikidata_qid' end,
    case when p.birth_date is not null and p.death_date is not null and p.birth_date > p.death_date
      then 'birth_after_death' end,
    case when coalesce(p.is_living,false) and p.death_date is not null then 'living_with_death_date' end,
    case when not (
      (p.description is not null and length(btrim(p.description)) between 120 and 240)
      or (p.bio is not null and length(btrim(p.bio)) > 120)
    ) then 'summary_or_bio_too_thin' end,
    case when p.image_status in ('rejected','unavailable') or not (
      p.image_url is not null or exists (
        select 1 from public.image_asset_links l join public.image_assets a on a.id=l.asset_id
        where l.entity_type='personality' and l.entity_id=p.id and l.role='cover'
          and a.status='active' and a.optimization_status in ('optimized','cdn_optimized')
      )
    ) then 'image_unavailable' end,
    case when p.lgbti_connection is not null and p.lgbti_connection not in ('','none_known','unclear')
      and not exists (
        select 1 from public.personality_claim_sources cs
        where cs.personality_id=p.id and cs.field_name in ('lgbti_connection','lgbti_details')
          and cs.verification_status in ('pending','verified')
      ) then 'unsupported_lgbti_claim' end,
    case when p.is_adult and coalesce(p.enrichment_status->'promotion'->>'consent_confirmed','false') <> 'true'
      then 'adult_consent_required' end,
    case when coalesce(p.enrichment_status->'personhood'->>'verdict','')='non_person'
      then 'non_person' end
  ], null)::text[]
  from public.personalities p where p.id=p_id;
$$;
revoke all on function public.personality_publication_failures(uuid) from public, anon, authenticated;
grant execute on function public.personality_publication_failures(uuid) to service_role;

create or replace function public.compute_personality_quality_dimensions(p_id uuid)
returns jsonb
language plpgsql stable security invoker
set search_path = public, pg_temp
as $$
declare
  p public.personalities%rowtype;
  v_sources int;
  v_claims int;
  v_image boolean;
  v_canonical_tags int;
  v_failures text[];
  v_identity int;
  v_sourcing int;
  v_content int;
  v_image_score int;
  v_taxonomy int;
  v_links int;
  v_freshness int;
  v_safety int;
  v_score int;
begin
  select * into p from public.personalities where id=p_id;
  if not found then return null; end if;

  select count(*) into v_sources from public.personality_sources s where s.personality_id=p.id;
  select count(*) into v_claims from public.personality_claim_sources c
    where c.personality_id=p.id and c.verification_status in ('pending','verified');
  select exists(
    select 1 from public.image_asset_links l join public.image_assets a on a.id=l.asset_id
    where l.entity_type='personality' and l.entity_id=p.id and l.role='cover'
      and a.status='active' and a.optimization_status in ('optimized','cdn_optimized')
      and coalesce(a.optimized_url,a.thumbnail_url) is not null
  ) into v_image;
  select count(*) into v_canonical_tags
  from public.tag_assignments_norm ta join public.unified_tags u on u.id=ta.tag_id
  where ta.entity_type='personality' and ta.entity_id=p.id
    and u.status='active' and u.merged_into_id is null;
  v_failures := public.personality_publication_failures(p.id);

  v_identity := case
    when p.wikidata_status='resolved' and p.wikidata_qid is not null then 100
    when v_sources >= 2 then 80 when v_sources = 1 then 60 else 20 end;
  v_sourcing := least(100, case when v_sources>0 then 50 else 0 end
    + case when v_claims>0 then 40 else 0 end
    + case when jsonb_object_length(coalesce(p.field_provenance,'{}'::jsonb))>0 then 10 else 0 end);
  v_content := least(100,
    case when length(btrim(coalesce(p.description,''))) between 120 and 240 then 50
         when length(btrim(coalesce(p.description,'')))>0 then 25 else 0 end
    + case when length(btrim(coalesce(p.bio,'')))>120 then 50
           when length(btrim(coalesce(p.bio,'')))>0 then 25 else 0 end);
  v_image_score := case when p.image_status='unavailable' then 100 when v_image then 100
    when p.image_url is not null and p.image_status <> 'rejected' then 50 else 0 end;
  v_taxonomy := least(100,
    case when p.profession is not null and p.profession=public.normalize_profession(p.profession) then 45 else 0 end
    + case when cardinality(coalesce(p.roles,'{}'::text[]))>0 then 25 else 0 end
    + case when v_canonical_tags>0 then 30 else 0 end);
  v_links := least(100,
    case when p.birth_place is null or p.city_id is not null or p.country_id is not null then 35 else 0 end
    + case when p.death_place is null or p.death_city_id is not null or p.death_country_id is not null then 25 else 0 end
    + case when v_sources>0 then 40 else 0 end);
  v_freshness := case when p.last_refreshed_at is null then 20
    when p.last_refreshed_at > now()-interval '90 days' then 100
    when p.last_refreshed_at > now()-interval '365 days' then 60 else 20 end;
  v_safety := greatest(0, 100 - cardinality(v_failures)*20);

  if p.is_adult then
    v_score := round(0.25*v_identity + 0.25*v_sourcing + 0.15*v_content
      + 0.15*v_image_score + 0.10*v_taxonomy + 0.10*v_safety);
  else
    v_score := round(0.20*v_identity + 0.20*v_sourcing + 0.20*v_content
      + 0.15*v_image_score + 0.10*v_taxonomy + 0.05*v_links
      + 0.05*v_freshness + 0.05*v_safety);
  end if;

  return jsonb_build_object(
    'version',2, 'cohort',case when p.is_adult then 'adult' else 'encyclopedia' end,
    'score',v_score, 'identity',v_identity, 'sourcing',v_sourcing,
    'content',v_content, 'image',v_image_score, 'taxonomy',v_taxonomy,
    'links',v_links, 'freshness',v_freshness, 'safety',v_safety,
    'hard_failures',to_jsonb(v_failures)
  );
end;
$$;
revoke all on function public.compute_personality_quality_dimensions(uuid) from public, anon, authenticated;
grant execute on function public.compute_personality_quality_dimensions(uuid) to service_role;

create or replace function public.run_personality_quality_backfill(
  p_limit int default 500,
  p_cohort text default 'all',
  p_dry_run boolean default true
)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_candidates int; v_changed int := 0; v_batch text := gen_random_uuid()::text;
begin
  if p_cohort not in ('all','public','draft','encyclopedia','adult') then
    raise exception 'invalid cohort: %', p_cohort using errcode='22023';
  end if;
  with candidates as materialized (
    select p.id, public.compute_personality_quality_dimensions(p.id) dims
    from public.personalities p
    where p.duplicate_of_id is null and coalesce(p.review_status,'') not in ('archived','rejected')
      and (p_cohort='all'
        or (p_cohort='public' and p.visibility='public')
        or (p_cohort='draft' and p.visibility='draft')
        or (p_cohort='encyclopedia' and not p.is_adult)
        or (p_cohort='adult' and p.is_adult))
    order by p.quality_evaluated_at asc nulls first, p.updated_at desc
    limit greatest(1,least(p_limit,2000))
  )
  select count(*) into v_candidates from candidates;

  if not p_dry_run then
    with candidates as materialized (
      select p.id, public.compute_personality_quality_dimensions(p.id) dims
      from public.personalities p
      where p.duplicate_of_id is null and coalesce(p.review_status,'') not in ('archived','rejected')
        and (p_cohort='all'
          or (p_cohort='public' and p.visibility='public')
          or (p_cohort='draft' and p.visibility='draft')
          or (p_cohort='encyclopedia' and not p.is_adult)
          or (p_cohort='adult' and p.is_adult))
      order by p.quality_evaluated_at asc nulls first, p.updated_at desc
      limit greatest(1,least(p_limit,2000))
    ), upd as (
      update public.personalities p set
        quality_score=(c.dims->>'score')::numeric,
        quality_score_version=2,
        quality_dimensions=c.dims,
        quality_evaluated_at=now()
      from candidates c where p.id=c.id returning p.id
    ) select count(*) into v_changed from upd;
  end if;
  return jsonb_build_object('batch',v_batch,'cohort',p_cohort,'dry_run',p_dry_run,
    'candidates',v_candidates,'changed',v_changed);
end;
$$;
revoke all on function public.run_personality_quality_backfill(int,text,boolean)
  from public, anon, authenticated;
grant execute on function public.run_personality_quality_backfill(int,text,boolean) to service_role;

-- Publication transitions use hard failures; existing public rows are audited
-- but are not bulk-demoted by this migration.
create or replace function public.enforce_personality_public_gate()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_failures text[];
begin
  -- Enforce application publication transitions. Existing public rows remain
  -- available for review, and trusted migration fixtures can still be inserted.
  if tg_op='UPDATE' and new.visibility='public'
     and old.visibility is distinct from 'public' then
    v_failures := array_remove(array[
      case when new.duplicate_of_id is not null then 'duplicate' end,
      case when coalesce(new.review_status,'') in ('archived','rejected') then 'inactive' end,
      case when new.wikidata_status='resolved' and new.wikidata_qid is null then 'wikidata_state_mismatch' end,
      case when new.wikidata_qid is not null and new.wikidata_qid !~ '^Q[0-9]+$' then 'invalid_wikidata_qid' end,
      case when new.birth_date is not null and new.death_date is not null and new.birth_date>new.death_date
        then 'birth_after_death' end,
      case when coalesce(new.is_living,false) and new.death_date is not null then 'living_with_death_date' end,
      case when not (
        (new.description is not null and length(btrim(new.description)) between 120 and 240)
        or (new.bio is not null and length(btrim(new.bio))>120)
      ) then 'summary_or_bio_too_thin' end,
      case when new.image_status in ('rejected','unavailable') or not (
        new.image_url is not null or exists (
          select 1 from public.image_asset_links l join public.image_assets a on a.id=l.asset_id
          where l.entity_type='personality' and l.entity_id=new.id and l.role='cover'
            and a.status='active' and a.optimization_status in ('optimized','cdn_optimized')
        )
      ) then 'image_unavailable' end,
      case when new.lgbti_connection is not null and new.lgbti_connection not in ('','none_known','unclear')
        and not exists (
          select 1 from public.personality_claim_sources cs
          where cs.personality_id=new.id and cs.field_name in ('lgbti_connection','lgbti_details')
            and cs.verification_status in ('pending','verified')
        ) then 'unsupported_lgbti_claim' end,
      case when new.is_adult
        and coalesce(new.enrichment_status->'promotion'->>'consent_confirmed','false')<>'true'
        then 'adult_consent_required' end,
      case when coalesce(new.enrichment_status->'personhood'->>'verdict','')='non_person'
        then 'non_person' end
    ],null)::text[];
    if cardinality(v_failures)>0 then
      new.visibility := 'draft';
      new.seo_indexable := false;
      new.needs_attention := true;
      new.quality_dimensions := jsonb_set(coalesce(new.quality_dimensions,'{}'::jsonb),
        '{hard_failures}',to_jsonb(v_failures),true);
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_personality_public_gate() from public, anon, authenticated;

-- Keep the existing promotion API, but make its candidate selector agree with
-- the versioned hard gates. promote_personality still rechecks its legacy gate,
-- and the transition trigger above is the final authority.
create or replace function public.personalities_promotable(p_limit int default 500)
returns table (
  id uuid,
  name text,
  lgbti_relevance_score numeric,
  lgbti_connection text,
  has_bio boolean,
  has_image boolean,
  wikidata_qid text
)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select p.id, p.name, p.lgbti_relevance_score, p.lgbti_connection,
    (p.bio is not null and length(btrim(p.bio)) > 120),
    (p.image_url is not null or exists (
      select 1 from public.image_asset_links l join public.image_assets a on a.id=l.asset_id
      where l.entity_type='personality' and l.entity_id=p.id and l.role='cover'
        and a.status='active' and a.optimization_status in ('optimized','cdn_optimized')
    )),
    p.wikidata_qid
  from public.personalities p
  where p.visibility='draft'
    and not p.is_adult
    and not coalesce(p.needs_attention,false)
    and coalesce(p.lgbti_relevance_score,0) >= 0.7
    and cardinality(public.personality_publication_failures(p.id))=0
  order by p.lgbti_relevance_score desc, p.view_count desc nulls last, p.name
  limit greatest(1,least(p_limit,2000));
$$;
revoke all on function public.personalities_promotable(int) from public, anon;
grant execute on function public.personalities_promotable(int) to authenticated, service_role;
comment on function public.personalities_promotable(int) is
  'Encyclopedia profiles eligible for publication under personality quality rubric v2.';

-- ---------------------------------------------------------------------------
-- 5. Queue lifecycle, signal compaction, monitoring and release gates.
-- ---------------------------------------------------------------------------

update public.personality_coverage_gaps g set status='resolved', last_checked_at=now()
where g.status in ('open','queued') and not exists (
  select 1 from public.personalities p where p.id=g.personality_id
    and p.duplicate_of_id is null and coalesce(p.review_status,'') not in ('archived','rejected')
);

alter table public.personality_quality_signals add column if not exists updated_at timestamptz not null default now();
delete from public.personality_quality_signals a
using public.personality_quality_signals b
where a.personality_id=b.personality_id and a.signal_type=b.signal_type
  and coalesce(a.source,'')=coalesce(b.source,'')
  and (a.created_at < b.created_at or (a.created_at=b.created_at and a.id < b.id));
create index if not exists personality_quality_signals_retention_idx
  on public.personality_quality_signals(personality_id, signal_type, coalesce(source,''), created_at desc);

create or replace function public.prune_personality_quality_signals(
  p_retention interval default interval '30 days'
)
returns integer language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_deleted integer;
begin
  with ranked as (
    select id, row_number() over (
      partition by personality_id, signal_type, coalesce(source,'')
      order by created_at desc, id desc
    ) as recency
    from public.personality_quality_signals
  ), deleted as (
    delete from public.personality_quality_signals s
    using ranked r
    where s.id=r.id and r.recency>1 and s.created_at < now()-p_retention
    returning s.id
  ) select count(*) into v_deleted from deleted;
  return v_deleted;
end;
$$;
revoke all on function public.prune_personality_quality_signals(interval)
  from public, anon, authenticated;
grant execute on function public.prune_personality_quality_signals(interval) to service_role;

create or replace function public.personality_quality_dashboard()
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare v_result jsonb;
begin
  if not has_any_role_jwt(array['admin'::app_role,'moderator'::app_role])
     and current_user <> 'service_role' then
    raise exception 'unauthorized' using errcode='42501';
  end if;
  with base as (
    select p.*,
      case when p.is_adult then 'adult' else 'encyclopedia' end cohort,
      public.personality_publication_failures(p.id) failures
    from public.personalities p
    where p.duplicate_of_id is null and coalesce(p.review_status,'') not in ('archived','rejected')
  ), cohorts as (
    select cohort, count(*) total,
      count(*) filter(where visibility='public') public,
      count(*) filter(where quality_score<40) low_quality,
      count(*) filter(where cardinality(failures)>0) hard_gate_failures,
      round(avg(quality_score),1) average_quality
    from base group by cohort
  )
  select jsonb_build_object(
    'generated_at',now(),
    'cohorts',coalesce((select jsonb_agg(to_jsonb(c) order by cohort) from cohorts c),'[]'::jsonb),
    'open_coverage_gaps',(select count(*) from public.personality_coverage_gaps where status='open'),
    'open_tag_reviews',(select count(*) from public.personality_tag_review_queue where status='open'),
    'open_field_reviews',(select count(*) from public.personality_review_queue where status='open'),
    'unsupported_public_claims',(select count(*) from base where visibility='public' and failures @> array['unsupported_lgbti_claim']),
    'invalid_public_images',(select count(*) from base where visibility='public' and failures @> array['image_unavailable']),
    'pending_without_queue',(select count(*) from base b where b.review_status='pending'
      and not exists(select 1 from public.personality_review_queue q where q.personality_id=b.id and q.status='open')
      and not exists(select 1 from public.personality_tag_review_queue q where q.personality_id=b.id and q.status='open'))
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.personality_quality_dashboard() from public, anon;
grant execute on function public.personality_quality_dashboard() to authenticated, service_role;

create or replace function public.personality_quality_gate_checks()
returns table(gate text, severity text, failures bigint, detail jsonb)
language sql stable security definer
set search_path = public, pg_temp
as $$
  with pub as (
    select p.*, public.personality_publication_failures(p.id) reasons
    from public.personalities p
    where p.visibility='public' and p.duplicate_of_id is null
      and coalesce(p.review_status,'') not in ('archived','rejected')
  )
  select 'personality_invalid_qid','critical',count(*),jsonb_build_object('contract','Q[0-9]+ only')
    from pub where wikidata_qid is not null and wikidata_qid !~ '^Q[0-9]+$'
  union all
  select 'personality_life_dates','critical',count(*),jsonb_build_object('contract','coherent birth/death/living state')
    from pub where (birth_date is not null and death_date is not null and birth_date>death_date)
      or (coalesce(is_living,false) and death_date is not null)
  union all
  select 'personality_fields_shape','critical',count(*),jsonb_build_object('contract','fields is string array')
    from pub where not public.personality_fields_are_strings(fields)
  union all
  select 'personality_unsupported_claim','critical',count(*),jsonb_build_object('field','lgbti_connection')
    from pub where reasons @> array['unsupported_lgbti_claim']
  union all
  select 'personality_image','high',count(*),jsonb_build_object('contract','available or explicitly unavailable')
    from pub where reasons @> array['image_unavailable']
  union all
  select 'personality_summary','high',count(*),jsonb_build_object('contract','120-240 summary or >120 bio')
    from pub where reasons @> array['summary_or_bio_too_thin']
  union all
  select 'personality_queue_reconciliation','high',count(*),jsonb_build_object('contract','pending means actionable')
    from pub p where p.review_status='pending'
      and not exists(select 1 from public.personality_review_queue q where q.personality_id=p.id and q.status='open')
      and not exists(select 1 from public.personality_tag_review_queue q where q.personality_id=p.id and q.status='open');
$$;
revoke all on function public.personality_quality_gate_checks() from public, anon, authenticated;
grant execute on function public.personality_quality_gate_checks() to service_role;

-- profession_facets_refresh is intentionally not re-enabled here. A later
-- remediation converted its target to a live VIEW and retired the obsolete
-- REFRESH MATERIALIZED VIEW job; the healthy state is disabled + unscheduled.

-- Migration-time assertions: fail before committing a partially-normalized contract.
do $$
begin
  if exists(select 1 from public.personalities where wikidata_qid is not null and wikidata_qid !~ '^Q[0-9]+$') then
    raise exception 'invalid personality Wikidata identifiers remain';
  end if;
  if exists(select 1 from public.personalities where not public.personality_fields_are_strings(fields)) then
    raise exception 'non-string personality fields remain';
  end if;
  if exists(select 1 from public.event_personality_links l
            left join public.events e on e.id=l.event_id where e.id is null) then
    raise exception 'orphan event-personality link';
  end if;
end $$;

commit;
