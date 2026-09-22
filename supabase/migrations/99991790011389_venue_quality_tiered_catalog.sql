-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 99991790011389 with no repo file — the signature of
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
-- Venue quality v2: versioned, explainable snapshots and a shadow-mode catalog.
--
-- This is deliberately additive. `venue_quality_rollout.enforcement_enabled`
-- starts false, so the migration measures the new tiers without changing public
-- visibility or SEO. The public catalog view is the one eligibility contract for
-- clients and fixes the old `neq(...)` NULL trap with `IS DISTINCT FROM`.

-- ---------------------------------------------------------------------------
-- 1. Verification evidence and rollout control
-- ---------------------------------------------------------------------------

alter table public.venues
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid,
  add column if not exists verification_source text,
  add column if not exists verification_evidence jsonb not null default '{}'::jsonb;

create or replace function public.stamp_venue_verification()
returns trigger language plpgsql set search_path to 'public' as $verify$
begin
  if new.verified is true and (tg_op = 'INSERT' or old.verified is not true) then
    if nullif(btrim(coalesce(new.verification_source, '')), '') is null then
      raise exception 'verification_source is required when verifying a venue'
        using errcode = '23514';
    end if;
    if coalesce(new.verification_evidence, '{}'::jsonb) = '{}'::jsonb then
      raise exception 'verification_evidence is required when verifying a venue'
        using errcode = '23514';
    end if;
    new.verified_at := now();
    new.verified_by := auth.uid();
  elsif tg_op = 'UPDATE' and new.verified is not true and old.verified is true then
    new.verified_at := null;
    new.verified_by := null;
  end if;
  return new;
end;
$verify$;

drop trigger if exists trg_stamp_venue_verification on public.venues;

create trigger trg_stamp_venue_verification
before insert or update of verified, verification_source, verification_evidence on public.venues
for each row execute function public.stamp_venue_verification();

create table if not exists public.venue_quality_rollout (
  singleton boolean primary key default true check (singleton),
  enforcement_enabled boolean not null default false,
  score_version integer not null default 2 check (score_version > 0),
  promoted_minimum_tier text not null default 'guide_ready'
    check (promoted_minimum_tier in ('guide_ready', 'verified')),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

insert into public.venue_quality_rollout (singleton)
values (true)
on conflict (singleton) do nothing;

alter table public.venue_quality_rollout enable row level security;

drop policy if exists venue_quality_rollout_public_read on public.venue_quality_rollout;

create policy venue_quality_rollout_public_read on public.venue_quality_rollout
  for select to anon, authenticated using (true);

drop policy if exists venue_quality_rollout_admin_write on public.venue_quality_rollout;

create policy venue_quality_rollout_admin_write on public.venue_quality_rollout
  for all to authenticated
  using (public.has_role((select auth.uid()), 'admin'::public.app_role))
  with check (public.has_role((select auth.uid()), 'admin'::public.app_role));

grant select on public.venue_quality_rollout to anon, authenticated, service_role;

grant insert, update on public.venue_quality_rollout to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Current snapshots, history, and bounded recompute queue
-- ---------------------------------------------------------------------------

create table if not exists public.venue_quality_snapshots (
  venue_id uuid primary key references public.venues(id) on delete cascade,
  score_version integer not null check (score_version > 0),
  identity_score smallint not null check (identity_score between 0 and 100),
  location_score smallint not null check (location_score between 0 and 100),
  taxonomy_score smallint not null check (taxonomy_score between 0 and 100),
  description_score smallint not null check (description_score between 0 and 100),
  media_score smallint not null check (media_score between 0 and 100),
  contact_score smallint not null check (contact_score between 0 and 100),
  freshness_score smallint not null check (freshness_score between 0 and 100),
  relationship_score smallint not null check (relationship_score between 0 and 100),
  public_score smallint not null check (public_score between 0 and 100),
  quality_tier text not null
    check (quality_tier in ('suppressed', 'listed', 'guide_ready', 'verified')),
  blocker_codes text[] not null default '{}',
  source_last_seen_at timestamptz,
  verified_at timestamptz,
  computed_at timestamptz not null default now(),
  input_updated_at timestamptz not null,
  details jsonb not null default '{}'::jsonb
);

create index if not exists idx_venue_quality_snapshots_tier_score
  on public.venue_quality_snapshots (quality_tier, public_score desc, venue_id);

create index if not exists idx_venue_quality_snapshots_stale
  on public.venue_quality_snapshots (score_version, computed_at);

create index if not exists idx_venue_quality_snapshots_blockers
  on public.venue_quality_snapshots using gin (blocker_codes);

create table if not exists public.venue_quality_tier_history (
  id bigint generated always as identity primary key,
  venue_id uuid not null references public.venues(id) on delete cascade,
  from_tier text,
  to_tier text not null,
  public_score smallint not null,
  score_version integer not null,
  blocker_codes text[] not null default '{}',
  changed_at timestamptz not null default now()
);

create index if not exists idx_venue_quality_tier_history_venue_changed
  on public.venue_quality_tier_history (venue_id, changed_at desc);

create index if not exists idx_venue_quality_tier_history_changed
  on public.venue_quality_tier_history (changed_at desc);

create table if not exists public.venue_quality_recompute_queue (
  venue_id uuid primary key references public.venues(id) on delete cascade,
  reason text not null,
  enqueued_at timestamptz not null default now(),
  attempts integer not null default 0,
  last_error text
);

create index if not exists idx_venue_quality_recompute_queue_order
  on public.venue_quality_recompute_queue (enqueued_at, venue_id);

-- Public projection intentionally excludes dimensions, blockers and evidence.
-- A separate table is required because a security-invoker view cannot expose
-- selected columns from an admin-only table without exposing every column.
create table if not exists public.venue_quality_public (
  venue_id uuid primary key references public.venues(id) on delete cascade,
  quality_tier text not null
    check (quality_tier in ('suppressed', 'listed', 'guide_ready', 'verified')),
  public_quality_score smallint not null check (public_quality_score between 0 and 100),
  quality_scored_at timestamptz not null,
  verified_at timestamptz
);

create index if not exists idx_venue_quality_public_tier_score
  on public.venue_quality_public (quality_tier, public_quality_score desc, venue_id);

alter table public.venue_quality_snapshots enable row level security;

alter table public.venue_quality_tier_history enable row level security;

alter table public.venue_quality_recompute_queue enable row level security;

alter table public.venue_quality_public enable row level security;

drop policy if exists venue_quality_snapshots_admin_read on public.venue_quality_snapshots;

create policy venue_quality_snapshots_admin_read on public.venue_quality_snapshots
  for select to authenticated
  using (public.has_role((select auth.uid()), 'admin'::public.app_role));

drop policy if exists venue_quality_history_admin_read on public.venue_quality_tier_history;

create policy venue_quality_history_admin_read on public.venue_quality_tier_history
  for select to authenticated
  using (public.has_role((select auth.uid()), 'admin'::public.app_role));

drop policy if exists venue_quality_queue_admin_read on public.venue_quality_recompute_queue;

create policy venue_quality_queue_admin_read on public.venue_quality_recompute_queue
  for select to authenticated
  using (public.has_role((select auth.uid()), 'admin'::public.app_role));

drop policy if exists venue_quality_public_read on public.venue_quality_public;

create policy venue_quality_public_read on public.venue_quality_public
  for select to anon, authenticated using (true);

grant select on public.venue_quality_snapshots to authenticated, service_role;

grant select on public.venue_quality_tier_history to authenticated, service_role;

grant select on public.venue_quality_recompute_queue to authenticated, service_role;

grant select on public.venue_quality_public to anon, authenticated, service_role;

grant all on public.venue_quality_snapshots, public.venue_quality_tier_history,
  public.venue_quality_recompute_queue, public.venue_quality_public to service_role;

-- ---------------------------------------------------------------------------
-- 3. Deterministic scoring. Hard blockers are independent of completeness.
-- ---------------------------------------------------------------------------

create or replace function public.venue_description_issue(p_description text)
returns text
language sql
immutable
set search_path to 'public', 'pg_temp'
as $description$
  select case
    when nullif(btrim(regexp_replace(coalesce(p_description, ''), '<[^>]*>', ' ', 'g')), '') is null
      then 'missing'
    when lower(btrim(regexp_replace(p_description, '<[^>]*>', ' ', 'g'))) ~
      '^(tbd|todo|n/?a|unknown|coming soon|description unavailable|no description( available)?)\.?$'
      then 'placeholder'
    when lower(p_description) ~
      '(^|[[:space:]])(lorem ipsum|insert description|sample text|test venue)([[:space:]]|$)'
      then 'placeholder'
    when lower(p_description) ~
      '^(this|the) (event|article|news story|hotel|product|personality)\b'
      then 'wrong_subject'
    when length(btrim(regexp_replace(p_description, '<[^>]*>', ' ', 'g'))) < 40
      then 'too_short'
    else null
  end
$description$;

create index if not exists idx_venues_description_quality_fingerprint
  on public.venues ((md5(lower(regexp_replace(
    btrim(regexp_replace(coalesce(description, ''), '<[^>]*>', ' ', 'g')),
    '\s+', ' ', 'g'
  )))))
  where length(btrim(coalesce(description, ''))) >= 40;

create or replace function public.recompute_venue_quality_snapshot(p_venue_id uuid)
returns public.venue_quality_snapshots
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $quality$
declare
  v public.venues%rowtype;
  v_score_version integer;
  v_source_count integer := 0;
  v_source_last_seen timestamptz;
  v_description_text text;
  v_description_issue text;
  v_description_duplicate_count integer := 0;
  v_description_evidenced boolean := false;
  v_has_controlled_tag boolean := false;
  v_has_event boolean := false;
  v_image record;
  v_identity smallint := 0;
  v_location smallint := 0;
  v_taxonomy smallint := 0;
  v_description smallint := 0;
  v_media smallint := 0;
  v_contact smallint := 0;
  v_freshness smallint := 0;
  v_relationship smallint := 0;
  v_public smallint := 0;
  v_blockers text[] := '{}';
  v_tier text := 'suppressed';
  v_old_tier text;
  v_is_listed boolean := false;
  v_is_guide_ready boolean := false;
  v_result public.venue_quality_snapshots%rowtype;
begin
  select * into v from public.venues where id = p_venue_id;
  if not found then
    delete from public.venue_quality_recompute_queue where venue_id = p_venue_id;
    return null;
  end if;

  select score_version into v_score_version
  from public.venue_quality_rollout where singleton;

  select count(*), max(last_seen_at)
    into v_source_count, v_source_last_seen
  from public.venue_sources where venue_id = v.id;

  v_description_text := btrim(regexp_replace(coalesce(v.description, ''), '<[^>]*>', ' ', 'g'));
  v_description_text := regexp_replace(v_description_text, '\s+', ' ', 'g');
  v_description_issue := public.venue_description_issue(v.description);

  if v_description_issue is null and length(v_description_text) >= 40 then
    select count(*)::integer into v_description_duplicate_count
    from (
      select 1
      from public.venues other
      where other.id <> v.id
        and length(btrim(coalesce(other.description, ''))) >= 40
        and md5(lower(regexp_replace(btrim(regexp_replace(coalesce(other.description, ''), '<[^>]*>', ' ', 'g')), '\s+', ' ', 'g')))
            = md5(lower(v_description_text))
        and lower(regexp_replace(btrim(regexp_replace(coalesce(other.description, ''), '<[^>]*>', ' ', 'g')), '\s+', ' ', 'g'))
            = lower(v_description_text)
      limit 2
    ) duplicates;
    if v_description_duplicate_count >= 2 then
      v_description_issue := 'duplicated_boilerplate';
    end if;
  end if;

  select exists (
    select 1 from public.venue_field_provenance p
    where p.venue_id = v.id and p.field = 'description' and p.is_winning
      and p.source not in ('llm', 'ai', 'generated')
      and p.value is not null
  ) into v_description_evidenced;
  v_description_evidenced := v_description_evidenced and v_description_issue is null;

  select exists (
    select 1 from public.venue_tag_assignments a
    join public.unified_tags t on t.id = a.tag_id
    where a.venue_id = v.id and t.status = 'active'
  ) into v_has_controlled_tag;

  select exists (
    select 1 from public.events e
    where e.venue_id = v.id and e.duplicate_of_id is null and e.is_public
  ) into v_has_event;

  select
    true as present,
    ia.optimization_status in ('optimized', 'cdn_optimized') and ia.optimized_url is not null as optimized,
    ia.width is not null and ia.height is not null as dimensioned,
    nullif(btrim(ia.alt_text), '') is not null as has_alt,
    nullif(btrim(ia.license), '') is not null as has_license,
    nullif(btrim(ia.attribution), '') is not null as has_attribution
  into v_image
  from public.image_asset_links l
  join public.image_assets ia on ia.id = l.asset_id
  where l.entity_type = 'venue' and l.entity_id = v.id and l.role = 'cover'
    and ia.status = 'active' and not ia.is_flagged
  order by l.sort_order, l.added_at
  limit 1;

  v_identity :=
    (case when length(btrim(coalesce(v.name, ''))) >= 2 then 60 else 0 end)
    + (case when v.slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' then 40 else 0 end);
  v_location :=
    (case when v.country_id is not null then 35 else 0 end)
    + (case when v.city_id is not null then 25 else 0 end)
    + (case when v.latitude between -90 and 90 and v.longitude between -180 and 180 then 25 else 0 end)
    + (case when nullif(btrim(coalesce(v.address, '')), '') is not null then 15 else 0 end);
  v_taxonomy :=
    (case when v.category is not null and v.category <> 'other' then 70 else 0 end)
    + (case when v_has_controlled_tag then 30 else 0 end);
  v_description :=
    (case when length(v_description_text) > 0 then 20 else 0 end)
    + (case when length(v_description_text) >= 120 then 35 else 0 end)
    + (case when v_description_evidenced then 35 else 0 end)
    + (case when nullif(btrim(coalesce(v.content_language, '')), '') is not null then 10 else 0 end);
  v_media :=
    (case when coalesce(v_image.present, false) then 35 else 0 end)
    + (case when coalesce(v_image.optimized, false) then 20 else 0 end)
    + (case when coalesce(v_image.dimensioned, false) then 15 else 0 end)
    + (case when coalesce(v_image.has_alt, false) then 10 else 0 end)
    + (case when coalesce(v_image.has_license, false) then 10 else 0 end)
    + (case when coalesce(v_image.has_attribution, false) then 10 else 0 end);
  v_contact := least(100,
    (case when nullif(btrim(coalesce(v.website, '')), '') is not null
                and coalesce(v.url_status, 'unknown') in ('ok', 'redirect', '200', '301', '302') then 40 else 0 end)
    + (case when nullif(btrim(coalesce(v.phone, '')), '') is not null then 25 else 0 end)
    + (case when nullif(btrim(coalesce(v.email, '')), '') is not null then 20 else 0 end)
    + (case when nullif(btrim(coalesce(v.instagram, '')), '') is not null then 10 else 0 end)
    + (case when v.hours is not null and v.hours <> '{}'::jsonb then 15 else 0 end));
  v_freshness := case
    when v_source_last_seen is null then 0
    when v_source_last_seen >= now() - interval '30 days' then 100
    when v_source_last_seen >= now() - interval '180 days' then 75
    when v_source_last_seen >= now() - interval '365 days' then 25
    else 0 end;
  v_relationship := least(100,
    (case when v.organization_id is not null then 35 else 0 end)
    + (case when v.queer_village_id is not null then 25 else 0 end)
    + (case when v_has_event then 40 else 0 end));

  if v.duplicate_of_id is not null then v_blockers := array_append(v_blockers, 'duplicate'); end if;
  if v.review_status = 'archived' then v_blockers := array_append(v_blockers, 'archived'); end if;
  if v.closed_at is not null or v.closure_status = 'closed' then v_blockers := array_append(v_blockers, 'closed'); end if;
  if v.enrichment_status->'nonvenue_candidate'->>'status' = 'confirmed' then
    v_blockers := array_append(v_blockers, 'confirmed_nonvenue');
  end if;
  if length(btrim(coalesce(v.name, ''))) < 2 then v_blockers := array_append(v_blockers, 'invalid_identity'); end if;
  if v.country_id is null then v_blockers := array_append(v_blockers, 'missing_country'); end if;
  if v.city_id is null and not (v.latitude between -90 and 90 and v.longitude between -180 and 180) then
    v_blockers := array_append(v_blockers, 'missing_location');
  end if;
  if v_source_count = 0 then v_blockers := array_append(v_blockers, 'no_source'); end if;

  v_public := round(
      v_identity * 0.10 + v_location * 0.20 + v_taxonomy * 0.15
    + v_description * 0.20 + v_media * 0.15 + v_contact * 0.10
    + v_freshness * 0.05 + v_relationship * 0.05)::smallint;

  v_is_listed := cardinality(v_blockers) = 0;
  v_is_guide_ready := v_is_listed
    and v.category <> 'other'
    and length(v_description_text) >= 120
    and v_description_evidenced
    and coalesce(v_image.present, false)
    and coalesce(v_image.dimensioned, false)
    and coalesce(v_image.has_alt, false)
    and coalesce(v_image.has_license, false)
    and coalesce(v_image.has_attribution, false)
    and v_contact > 0
    and v_source_last_seen >= now() - interval '180 days'
    and v.needs_attention is not true;

  v_tier := case
    when not v_is_listed then 'suppressed'
    when v_is_guide_ready and v.verified is true and v.verified_at is not null
      and v.verification_evidence <> '{}'::jsonb then 'verified'
    when v_is_guide_ready then 'guide_ready'
    else 'listed'
  end;

  select quality_tier into v_old_tier
  from public.venue_quality_snapshots where venue_id = v.id;

  insert into public.venue_quality_snapshots (
    venue_id, score_version, identity_score, location_score, taxonomy_score,
    description_score, media_score, contact_score, freshness_score,
    relationship_score, public_score, quality_tier, blocker_codes,
    source_last_seen_at, verified_at, computed_at, input_updated_at, details
  ) values (
    v.id, v_score_version, v_identity, v_location, v_taxonomy,
    v_description, v_media, v_contact, v_freshness, v_relationship,
    v_public, v_tier, v_blockers, v_source_last_seen, v.verified_at, now(),
    v.updated_at,
    jsonb_build_object(
      'source_count', v_source_count,
      'description_length', length(v_description_text),
      'description_issue', v_description_issue,
      'description_evidenced', v_description_evidenced,
      'managed_cover', coalesce(v_image.present, false),
      'controlled_tags', v_has_controlled_tag,
      'has_linked_event', v_has_event,
      'safety_gated', v.safety_gated
    )
  )
  on conflict (venue_id) do update set
    score_version = excluded.score_version,
    identity_score = excluded.identity_score,
    location_score = excluded.location_score,
    taxonomy_score = excluded.taxonomy_score,
    description_score = excluded.description_score,
    media_score = excluded.media_score,
    contact_score = excluded.contact_score,
    freshness_score = excluded.freshness_score,
    relationship_score = excluded.relationship_score,
    public_score = excluded.public_score,
    quality_tier = excluded.quality_tier,
    blocker_codes = excluded.blocker_codes,
    source_last_seen_at = excluded.source_last_seen_at,
    verified_at = excluded.verified_at,
    computed_at = excluded.computed_at,
    input_updated_at = excluded.input_updated_at,
    details = excluded.details
  returning * into v_result;

  if v_old_tier is distinct from v_tier then
    insert into public.venue_quality_tier_history
      (venue_id, from_tier, to_tier, public_score, score_version, blocker_codes)
    values (v.id, v_old_tier, v_tier, v_public, v_score_version, v_blockers);
  end if;

  insert into public.venue_quality_public
    (venue_id, quality_tier, public_quality_score, quality_scored_at, verified_at)
  values (v.id, v_tier, v_public, v_result.computed_at, v.verified_at)
  on conflict (venue_id) do update set
    quality_tier = excluded.quality_tier,
    public_quality_score = excluded.public_quality_score,
    quality_scored_at = excluded.quality_scored_at,
    verified_at = excluded.verified_at;

  delete from public.venue_quality_recompute_queue where venue_id = v.id;
  return v_result;
end;
$quality$;

revoke all on function public.recompute_venue_quality_snapshot(uuid) from public, anon, authenticated;

grant execute on function public.recompute_venue_quality_snapshot(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Incremental invalidation and reconciliation
-- ---------------------------------------------------------------------------

create or replace function public.enqueue_venue_quality_from_venue()
returns trigger language plpgsql set search_path to 'public' as $queue$
begin
  insert into public.venue_quality_recompute_queue (venue_id, reason, enqueued_at)
  values (new.id, 'venue_changed', now())
  on conflict (venue_id) do update
    set reason = excluded.reason, enqueued_at = excluded.enqueued_at, last_error = null;
  return new;
end;
$queue$;

drop trigger if exists trg_venue_quality_enqueue_venue on public.venues;

create trigger trg_venue_quality_enqueue_venue
after insert or update of name, slug, description, content_language, category, address,
  city_id, country_id, latitude, longitude, website, url_status, phone, email,
  instagram, hours, needs_attention, duplicate_of_id, review_status, closed_at,
  closure_status, enrichment_status, organization_id, queer_village_id, verified,
  verified_at, verification_evidence
on public.venues for each row execute function public.enqueue_venue_quality_from_venue();

create or replace function public.enqueue_venue_quality_from_source()
returns trigger language plpgsql set search_path to 'public' as $queue$
declare v_id uuid := coalesce(new.venue_id, old.venue_id);
begin
  insert into public.venue_quality_recompute_queue (venue_id, reason, enqueued_at)
  values (v_id, 'source_changed', now())
  on conflict (venue_id) do update
    set reason = excluded.reason, enqueued_at = excluded.enqueued_at, last_error = null;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$queue$;

drop trigger if exists trg_venue_quality_enqueue_source on public.venue_sources;

create trigger trg_venue_quality_enqueue_source
after insert or update or delete on public.venue_sources
for each row execute function public.enqueue_venue_quality_from_source();

drop trigger if exists trg_venue_quality_enqueue_provenance on public.venue_field_provenance;

create trigger trg_venue_quality_enqueue_provenance
after insert or update or delete on public.venue_field_provenance
for each row execute function public.enqueue_venue_quality_from_source();

create or replace function public.refresh_venue_image_projection(p_venue_id uuid)
returns void language sql set search_path to 'public' as $images$
  update public.venues v
  set images = coalesce((
    select array_agg(coalesce(ia.optimized_url, ia.url)
      order by (l.role = 'cover') desc, l.sort_order, l.added_at, ia.id)
    from public.image_asset_links l
    join public.image_assets ia on ia.id = l.asset_id
    where l.entity_type = 'venue' and l.entity_id = p_venue_id
      and ia.status = 'active' and not ia.is_flagged
  ), '{}')
  where v.id = p_venue_id
    and v.images is distinct from coalesce((
      select array_agg(coalesce(ia.optimized_url, ia.url)
        order by (l.role = 'cover') desc, l.sort_order, l.added_at, ia.id)
      from public.image_asset_links l
      join public.image_assets ia on ia.id = l.asset_id
      where l.entity_type = 'venue' and l.entity_id = p_venue_id
        and ia.status = 'active' and not ia.is_flagged
    ), '{}')
$images$;

create or replace function public.enqueue_venue_quality_from_image_link()
returns trigger language plpgsql set search_path to 'public' as $queue$
declare
  v_old_id uuid;
  v_new_id uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') and old.entity_type = 'venue' then
    v_old_id := old.entity_id;
    perform public.refresh_venue_image_projection(v_old_id);
    insert into public.venue_quality_recompute_queue (venue_id, reason, enqueued_at)
    values (v_old_id, 'image_changed', now())
    on conflict (venue_id) do update
      set reason = excluded.reason, enqueued_at = excluded.enqueued_at, last_error = null;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.entity_type = 'venue'
     and (v_old_id is null or new.entity_id is distinct from v_old_id) then
    v_new_id := new.entity_id;
    perform public.refresh_venue_image_projection(v_new_id);
    insert into public.venue_quality_recompute_queue (venue_id, reason, enqueued_at)
    values (v_new_id, 'image_changed', now())
    on conflict (venue_id) do update
      set reason = excluded.reason, enqueued_at = excluded.enqueued_at, last_error = null;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$queue$;

drop trigger if exists trg_venue_quality_enqueue_image_link on public.image_asset_links;

create trigger trg_venue_quality_enqueue_image_link
after insert or update or delete on public.image_asset_links
for each row execute function public.enqueue_venue_quality_from_image_link();

create or replace function public.enqueue_venue_quality_from_image_asset()
returns trigger language plpgsql set search_path to 'public' as $queue$
begin
  perform public.refresh_venue_image_projection(l.entity_id)
  from public.image_asset_links l
  where l.asset_id = new.id and l.entity_type = 'venue';

  insert into public.venue_quality_recompute_queue (venue_id, reason, enqueued_at)
  select distinct l.entity_id, 'image_asset_changed', now()
  from public.image_asset_links l
  where l.asset_id = new.id and l.entity_type = 'venue'
  on conflict (venue_id) do update
    set reason = excluded.reason, enqueued_at = excluded.enqueued_at, last_error = null;
  return new;
end;
$queue$;

drop trigger if exists trg_venue_quality_enqueue_image_asset on public.image_assets;

create trigger trg_venue_quality_enqueue_image_asset
after update of status, is_flagged, optimized_url, optimization_status, width, height,
  alt_text, license, attribution, last_seen_at
on public.image_assets for each row execute function public.enqueue_venue_quality_from_image_asset();

create or replace function public.enqueue_venue_quality_from_tag_assignment()
returns trigger language plpgsql set search_path to 'public' as $queue$
declare v_id uuid := coalesce(new.venue_id, old.venue_id);
begin
  insert into public.venue_quality_recompute_queue (venue_id, reason, enqueued_at)
  values (v_id, 'tag_changed', now())
  on conflict (venue_id) do update
    set reason = excluded.reason, enqueued_at = excluded.enqueued_at, last_error = null;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$queue$;

drop trigger if exists trg_venue_quality_enqueue_tag on public.venue_tag_assignments;

create trigger trg_venue_quality_enqueue_tag
after insert or update or delete on public.venue_tag_assignments
for each row execute function public.enqueue_venue_quality_from_tag_assignment();

create or replace function public.enqueue_venue_quality_from_event()
returns trigger language plpgsql set search_path to 'public' as $queue$
begin
  if old.venue_id is not null then
    insert into public.venue_quality_recompute_queue (venue_id, reason, enqueued_at)
    values (old.venue_id, 'event_link_changed', now())
    on conflict (venue_id) do update
      set reason = excluded.reason, enqueued_at = excluded.enqueued_at, last_error = null;
  end if;
  if new.venue_id is not null and new.venue_id is distinct from old.venue_id then
    insert into public.venue_quality_recompute_queue (venue_id, reason, enqueued_at)
    values (new.venue_id, 'event_link_changed', now())
    on conflict (venue_id) do update
      set reason = excluded.reason, enqueued_at = excluded.enqueued_at, last_error = null;
  end if;
  return new;
end;
$queue$;

drop trigger if exists trg_venue_quality_enqueue_event on public.events;

create trigger trg_venue_quality_enqueue_event
after update of venue_id, is_public, duplicate_of_id on public.events
for each row execute function public.enqueue_venue_quality_from_event();

drop function if exists public.run_venue_quality_recompute(integer);

create function public.run_venue_quality_recompute(p_batch integer default 5000)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $run$
declare
  r record;
  v_processed integer := 0;
  v_failed integer := 0;
  v_pending integer := 0;
  v_version integer;
begin
  select score_version into v_version from public.venue_quality_rollout where singleton;

  for r in
    select venue_id from public.venue_quality_recompute_queue
    order by enqueued_at, venue_id
    limit greatest(1, least(coalesce(p_batch, 5000), 10000))
    for update skip locked
  loop
    begin
      perform public.recompute_venue_quality_snapshot(r.venue_id);
      v_processed := v_processed + 1;
    exception when others then
      v_failed := v_failed + 1;
      update public.venue_quality_recompute_queue
      set attempts = attempts + 1, last_error = left(sqlerrm, 1000), enqueued_at = now()
      where venue_id = r.venue_id;
    end;
  end loop;

  select count(*) into v_pending from public.venue_quality_recompute_queue;
  return jsonb_build_object(
    'processed', v_processed, 'failed', v_failed, 'pending', v_pending,
    'score_version', v_version, 'converged', v_pending = 0
  );
end;
$run$;

revoke all on function public.run_venue_quality_recompute(integer) from public, anon, authenticated;

grant execute on function public.run_venue_quality_recompute(integer) to service_role;

create or replace function public.reconcile_venue_quality_queue(p_enqueue_limit integer default 10000)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $reconcile$
declare
  v_version integer;
  v_enqueued integer;
begin
  select score_version into v_version from public.venue_quality_rollout where singleton;
  with candidates as (
    select v.id
    from public.venues v
    left join public.venue_quality_snapshots q on q.venue_id = v.id
    where q.venue_id is null or q.score_version <> v_version or q.input_updated_at < v.updated_at
    order by v.updated_at desc, v.id
    limit greatest(1, least(coalesce(p_enqueue_limit, 10000), 20000))
  )
  insert into public.venue_quality_recompute_queue (venue_id, reason)
  select id, 'reconciliation' from candidates
  on conflict (venue_id) do nothing;
  get diagnostics v_enqueued = row_count;
  return jsonb_build_object('enqueued', v_enqueued, 'score_version', v_version);
end;
$reconcile$;

revoke all on function public.reconcile_venue_quality_queue(integer) from public, anon, authenticated;

grant execute on function public.reconcile_venue_quality_queue(integer) to service_role;

insert into public.venue_quality_recompute_queue (venue_id, reason)
select id, 'initial_v2_backfill' from public.venues
on conflict (venue_id) do nothing;

update public.admin_automations
set description = 'Reconciles versioned venue quality snapshots. A successful run reports pending work and converged=false until the queue is empty.',
    action = jsonb_build_object(
      'type', 'cron',
      'jobname', 'venue_quality_recompute',
      'command', 'SELECT public.reconcile_venue_quality_queue(10000); SELECT public.run_venue_quality_recompute(5000)'
    ),
    schedule = '0 * * * *',
    enabled = true
where slug = 'venue_quality_recompute';

do $quality_cron$
begin
  if exists (select 1 from cron.job where jobname = 'venue_quality_recompute') then
    perform cron.unschedule('venue_quality_recompute');
  end if;
  if exists (select 1 from cron.job where jobname = 'venue-quality-recompute') then
    perform cron.unschedule('venue-quality-recompute');
  end if;
  perform cron.schedule(
    'venue_quality_recompute',
    '0 * * * *',
    'SELECT public.reconcile_venue_quality_queue(10000); SELECT public.run_venue_quality_recompute(5000);'
  );
end;
$quality_cron$;

-- The event linker is already precision-gated to one exact normalized-name
-- match in the same city; ambiguous candidates go to review. Activate that
-- reviewed path so named upcoming events stop remaining permanently unlinked.
update public.admin_automations
set enabled = true,
    description = coalesce(description, '')
      || ' [Activated by venue quality v2: exact, unique city matches only; ambiguous candidates remain in review.]',
    updated_at = now()
where slug = 'event_venue_link';

do $event_link_cron$
begin
  if exists (select 1 from cron.job where jobname = 'event_venue_link') then
    perform cron.unschedule('event_venue_link');
  end if;
  perform cron.schedule(
    'event_venue_link',
    '25 3 * * *',
    'SELECT public.run_event_venue_link();'
  );
end;
$event_link_cron$;

-- The phash worker already has a bounded, forward-progress selector using
-- phash_checked_at. Re-register an existing auto-paused job through pg_cron's
-- supported API while retaining its reviewed command and schedule.
do $phash_cron$
declare
  v_command text;
  v_schedule text;
begin
  select command, schedule into v_command, v_schedule
  from cron.job where jobname = 'image_phash_backfill' limit 1;
  if v_command is not null then
    perform cron.unschedule('image_phash_backfill');
    perform cron.schedule('image_phash_backfill', v_schedule, v_command);
  end if;
end;
$phash_cron$;

-- ---------------------------------------------------------------------------
-- 5. Venue-specific tags become authoritative and mirror to the unified graph.
-- ---------------------------------------------------------------------------

do $fk$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.venue_tag_assignments'::regclass
      and conname = 'venue_tag_assignments_tag_id_fkey'
  ) then
    alter table public.venue_tag_assignments
      add constraint venue_tag_assignments_tag_id_fkey
      foreign key (tag_id) references public.unified_tags(id) on delete cascade not valid;
  end if;
end;
$fk$;

create or replace function public.sync_venue_tag_assignment_graph()
returns trigger language plpgsql set search_path to 'public' as $tags$
declare v_venue_id uuid := coalesce(new.venue_id, old.venue_id);
begin
  delete from public.unified_tag_assignments
  where entity_type = 'venue' and entity_id = v_venue_id;

  insert into public.unified_tag_assignments (tag_id, entity_id, entity_type)
  select a.tag_id, a.venue_id, 'venue'
  from public.venue_tag_assignments a
  where a.venue_id = v_venue_id
  on conflict (tag_id, entity_id, entity_type) do nothing;

  update public.venues v
  set tags = coalesce((
    select array_agg(t.slug order by t.slug)
    from public.venue_tag_assignments a
    join public.unified_tags t on t.id = a.tag_id
    where a.venue_id = v_venue_id and t.status = 'active'
  ), '{}')
  where v.id = v_venue_id
    and v.tags is distinct from coalesce((
      select array_agg(t.slug order by t.slug)
      from public.venue_tag_assignments a
      join public.unified_tags t on t.id = a.tag_id
      where a.venue_id = v_venue_id and t.status = 'active'
    ), '{}');
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$tags$;

drop trigger if exists trg_sync_venue_tag_assignment_graph on public.venue_tag_assignments;

create trigger trg_sync_venue_tag_assignment_graph
after insert or update or delete on public.venue_tag_assignments
for each row execute function public.sync_venue_tag_assignment_graph();

create or replace function public.backfill_venue_tag_assignments(p_batch integer default 1000)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $tags$
declare v_inserted integer;
begin
  with candidates as (
    select v.id, tag_slug
    from public.venues v
    cross join lateral unnest(coalesce(v.tags, '{}')) tag_slug
    where not exists (
      select 1 from public.venue_tag_assignments a where a.venue_id = v.id
    )
    order by v.id, tag_slug
    limit greatest(1, least(coalesce(p_batch, 1000), 5000))
  )
  insert into public.venue_tag_assignments (venue_id, tag_id)
  select c.id, t.id
  from candidates c
  join public.unified_tags t on t.slug = c.tag_slug and t.status = 'active'
  on conflict (venue_id, tag_id) do nothing;
  get diagnostics v_inserted = row_count;
  return jsonb_build_object('inserted', v_inserted);
end;
$tags$;

revoke all on function public.backfill_venue_tag_assignments(integer) from public, anon, authenticated;

grant execute on function public.backfill_venue_tag_assignments(integer) to service_role;

-- ---------------------------------------------------------------------------
-- 6. One public catalog contract. Security invoker preserves venue RLS.
-- ---------------------------------------------------------------------------

create or replace view public.venue_catalog_public
with (security_invoker = true)
as
select
  v.*,
  coalesce(q.quality_tier, 'listed') as quality_tier,
  coalesce(q.public_quality_score, v.quality_score, 0)::smallint as public_quality_score,
  q.quality_scored_at,
  case when r.enforcement_enabled
    then q.quality_tier in ('guide_ready', 'verified')
    else v.category <> 'other' or coalesce(v.lgbti_relevance_score, 0) >= 0.5
  end as catalog_promotable,
  case when r.enforcement_enabled
    then q.quality_tier in ('guide_ready', 'verified')
    else v.seo_indexable
  end as catalog_indexable,
  r.enforcement_enabled as quality_enforcement_enabled
from public.venues v
left join public.venue_quality_public q on q.venue_id = v.id
cross join public.venue_quality_rollout r
where r.singleton
  and v.data_source is distinct from 'refuge-restrooms'
  and v.review_status is distinct from 'archived'
  and v.duplicate_of_id is null
  and v.closed_at is null
  and (not r.enforcement_enabled or coalesce(q.quality_tier, 'suppressed') <> 'suppressed');

grant select on public.venue_catalog_public to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Admin scorecard: current tiers, dimensions, blockers, sources and drift.
-- ---------------------------------------------------------------------------

create or replace function public.venue_quality_priority_cohort(p_limit integer default 1000)
returns table(
  priority_rank bigint,
  venue_id uuid,
  venue_name text,
  city text,
  quality_tier text,
  public_score smallint,
  impact_score bigint,
  reasons text[]
)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $priority$
begin
  perform public.assert_admin_or_internal();
  return query
  with favorite_counts as (
    select f.venue_id, count(*)::bigint as n from public.venue_favorites f group by f.venue_id
  ), checkin_counts as (
    select c.venue_id, count(*)::bigint as n from public.venue_checkins c group by c.venue_id
  ), upcoming_events as (
    select e.venue_id, count(*)::bigint as n
    from public.events e
    where e.venue_id is not null and e.is_public and e.duplicate_of_id is null
      and e.start_date >= now() - interval '1 day'
    group by e.venue_id
  ), ranked as (
    select v.id, v.name, v.city, q.quality_tier, q.public_score,
      coalesce(f.n, 0) * 10 + coalesce(c.n, 0) * 5 + coalesce(e.n, 0) * 25
        + case when v.city = any(array['Berlin','Basel','Zürich','Zurich','New York','Rio de Janeiro','San Francisco','London']) then 50 else 0 end
        + greatest(0, 70 - coalesce(q.public_score, 0)) as impact,
      array_remove(array[
        case when coalesce(e.n, 0) > 0 then 'upcoming_events' end,
        case when coalesce(f.n, 0) + coalesce(c.n, 0) > 0 then 'user_activity' end,
        case when v.city = any(array['Berlin','Basel','Zürich','Zurich','New York','Rio de Janeiro','San Francisco','London']) then 'priority_city' end,
        case when q.quality_tier is null then 'unscored' end,
        case when q.quality_tier = 'listed' then 'not_guide_ready' end
      ], null)::text[] as reasons
    from public.venues v
    left join public.venue_quality_snapshots q on q.venue_id = v.id
    left join favorite_counts f on f.venue_id = v.id
    left join checkin_counts c on c.venue_id = v.id
    left join upcoming_events e on e.venue_id = v.id
    where v.duplicate_of_id is null and v.closed_at is null
      and v.review_status is distinct from 'archived'
      and coalesce(q.quality_tier, 'listed') not in ('guide_ready', 'verified', 'suppressed')
  )
  select row_number() over (order by r.impact desc, r.public_score desc nulls last, r.id),
    r.id, r.name, r.city, coalesce(r.quality_tier, 'listed'), r.public_score,
    r.impact, r.reasons
  from ranked r
  order by r.impact desc, r.public_score desc nulls last, r.id
  limit greatest(1, least(coalesce(p_limit, 1000), 5000));
end;
$priority$;

revoke all on function public.venue_quality_priority_cohort(integer) from public, anon;

grant execute on function public.venue_quality_priority_cohort(integer) to authenticated, service_role;

create or replace function public.venue_quality_dashboard()
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $dashboard$
with cfg as (
  select * from public.venue_quality_rollout where singleton
), live as (
  select v.*, q.quality_tier, q.public_score, q.blocker_codes, q.score_version,
         q.computed_at, q.identity_score, q.location_score, q.taxonomy_score,
         q.description_score, q.media_score, q.contact_score, q.freshness_score,
         q.relationship_score
  from public.venues v
  left join public.venue_quality_snapshots q on q.venue_id = v.id
  where v.duplicate_of_id is null and v.closed_at is null
    and v.review_status is distinct from 'archived'
), blocker_counts as (
  select blocker, count(*)::integer as n
  from live cross join lateral unnest(coalesce(blocker_codes, '{}')) blocker
  group by blocker
), source_cohorts as (
  select coalesce(v.data_source, 'unknown') as source,
         count(*)::integer as total,
         count(*) filter (where l.quality_tier in ('guide_ready', 'verified'))::integer as promoted,
         round(avg(l.public_score), 1) as average_score
  from live l join public.venues v on v.id = l.id
  group by coalesce(v.data_source, 'unknown')
  order by count(*) desc
  limit 12
), city_gaps as (
  select coalesce(v.city, 'Unknown') as city,
         count(*) filter (where l.quality_tier = 'listed')::integer as listed,
         count(*) filter (where l.quality_tier in ('guide_ready', 'verified'))::integer as promoted
  from live l join public.venues v on v.id = l.id
  group by coalesce(v.city, 'Unknown')
  having count(*) filter (where l.quality_tier = 'listed') > 0
  order by count(*) filter (where l.quality_tier = 'listed') desc
  limit 10
), transitions as (
  select to_tier, count(*)::integer as n
  from public.venue_quality_tier_history
  where changed_at >= now() - interval '7 days'
  group by to_tier
)
select jsonb_build_object(
  'enforcement_enabled', (select enforcement_enabled from cfg),
  'score_version', (select score_version from cfg),
  'live_venues', (select count(*) from live),
  'snapshots', (select count(*) from live where quality_tier is not null),
  'stale_snapshots', (select count(*) from live, cfg
    where quality_tier is null or live.score_version <> cfg.score_version
       or live.computed_at < live.updated_at),
  'pending_recompute', (select count(*) from public.venue_quality_recompute_queue),
  'tiers', (select coalesce(jsonb_object_agg(quality_tier, n), '{}'::jsonb)
    from (select coalesce(quality_tier, 'unscored') quality_tier, count(*) n
          from live group by coalesce(quality_tier, 'unscored')) x),
  'average_dimensions', (select jsonb_build_object(
    'identity', round(avg(identity_score), 1), 'location', round(avg(location_score), 1),
    'taxonomy', round(avg(taxonomy_score), 1), 'description', round(avg(description_score), 1),
    'media', round(avg(media_score), 1), 'contact', round(avg(contact_score), 1),
    'freshness', round(avg(freshness_score), 1), 'relationships', round(avg(relationship_score), 1)
  ) from live),
  'blockers', (select coalesce(jsonb_agg(jsonb_build_object('code', blocker, 'count', n) order by n desc), '[]'::jsonb) from blocker_counts),
  'source_cohorts', (select coalesce(jsonb_agg(to_jsonb(source_cohorts)), '[]'::jsonb) from source_cohorts),
  'city_gaps', (select coalesce(jsonb_agg(to_jsonb(city_gaps)), '[]'::jsonb) from city_gaps),
  'weekly_transitions', (select coalesce(jsonb_object_agg(to_tier, n), '{}'::jsonb) from transitions)
);
$dashboard$;

revoke all on function public.venue_quality_dashboard() from public, anon;

grant execute on function public.venue_quality_dashboard() to authenticated, service_role;

comment on table public.venue_quality_snapshots is
  'Versioned venue quality dimensions and hard blockers. Admin-only; public consumers use venue_catalog_public.';

comment on view public.venue_catalog_public is
  'Single public venue eligibility contract. Shadow mode preserves legacy visibility; enforcement is an explicit rollout switch.';

-- ---------------------------------------------------------------------------
-- 8. Ranked discovery consumes the same catalog contract and tier precedence.
-- ---------------------------------------------------------------------------

create or replace function public.rpc_venues_ranked(
  p_user_id uuid default null,
  p_lat numeric default null,
  p_lng numeric default null,
  p_filters jsonb default '{}'::jsonb,
  p_sort text default 'relevance',
  p_limit integer default 24,
  p_offset integer default 0
)
returns table(venue jsonb, score numeric, distance_m numeric, total_count bigint)
language plpgsql
stable
security definer
set search_path to 'public', 'auth'
as $ranked$
declare
  v_prefs_categories text[] := coalesce(
    (select array(select jsonb_array_elements_text(discovery_profile -> 'categories'))
       from public.profiles where user_id = p_user_id), '{}');
  v_prefs_tags text[] := coalesce(
    (select array(select jsonb_array_elements_text(discovery_profile -> 'tags'))
       from public.profiles where user_id = p_user_id), '{}');
  v_prefs_groups text[] := coalesce(
    (select array(select jsonb_array_elements_text(discovery_profile -> 'target_groups'))
       from public.profiles where user_id = p_user_id), '{}');
  v_behavior_cats text[] := case when p_user_id is null then '{}' else coalesce(
    (select array_agg(category) from (
      select v.category
      from public.venue_checkins c join public.venues v on v.id = c.venue_id
      where c.user_id = p_user_id and v.category is not null
      group by v.category having count(*) >= 3
    ) x), '{}') end;
  v_q text := nullif(p_filters->>'search', '');
  v_category text := nullif(p_filters->>'category', '');
  v_city text := nullif(p_filters->>'city', '');
  v_radius_km numeric := nullif(p_filters->>'radiusKm', '')::numeric;
  v_price integer := nullif(p_filters->>'priceLevel', '')::integer;
  v_promoted_only boolean := coalesce((p_filters->>'promotedOnly')::boolean, false);
  v_tags text[] := coalesce(array(select jsonb_array_elements_text(p_filters -> 'tags')), '{}');
  v_amenities text[] := coalesce(array(select jsonb_array_elements_text(p_filters -> 'amenities')), '{}');
  v_services text[] := coalesce(array(select jsonb_array_elements_text(p_filters -> 'services')), '{}');
  v_access text[] := coalesce(array(select jsonb_array_elements_text(p_filters -> 'accessibility')), '{}');
  v_groups text[] := coalesce(array(select jsonb_array_elements_text(p_filters -> 'groups')), '{}');
  v_w_distance numeric := case when p_user_id is null then 0.50 else 0.32 end;
  v_w_interest numeric := case when p_user_id is null then 0 else 0.23 end;
  v_w_behavior numeric := case when p_user_id is null then 0 else 0.13 end;
  v_w_quality numeric := case when p_user_id is null then 0.40 else 0.22 end;
  v_w_recency numeric := 0.10;
  v_show_gated boolean := (select auth.uid()) is not null;
  v_total bigint;
begin
  select count(*) into v_total
  from public.venue_catalog_public v
  where (v_show_gated or v.safety_gated is not true)
    and (not v_promoted_only or v.catalog_promotable)
    and (v_q is null or v.name ilike '%' || v_q || '%'
      or coalesce(v.description, '') ilike '%' || v_q || '%'
      or coalesce(v.address, '') ilike '%' || v_q || '%')
    and (v_category is null or v.category = v_category)
    and (v_city is null or v.city ilike '%' || v_city || '%')
    and (cardinality(v_tags) = 0 or v.tags && v_tags)
    and (cardinality(v_amenities) = 0 or v.amenities && v_amenities)
    and (cardinality(v_services) = 0 or v.services && v_services)
    and (cardinality(v_access) = 0 or v.accessibility_attributes && v_access)
    and (cardinality(v_groups) = 0 or v.target_groups && v_groups)
    and (v_price is null or v.price_range = v_price);

  return query
  with base as (
    select v.*,
      case when p_lat is not null and p_lng is not null
             and v.latitude is not null and v.longitude is not null then
        (6371000 * 2 * asin(sqrt(
          power(sin(radians((v.latitude - p_lat) / 2)), 2)
          + cos(radians(p_lat)) * cos(radians(v.latitude))
          * power(sin(radians((v.longitude - p_lng) / 2)), 2)
        )))::numeric
      end as dist_m
    from public.venue_catalog_public v
    where (v_show_gated or v.safety_gated is not true)
      and (not v_promoted_only or v.catalog_promotable)
      and (v_q is null or v.name ilike '%' || v_q || '%'
        or coalesce(v.description, '') ilike '%' || v_q || '%'
        or coalesce(v.address, '') ilike '%' || v_q || '%')
      and (v_category is null or v.category = v_category)
      and (v_city is null or v.city ilike '%' || v_city || '%')
      and (cardinality(v_tags) = 0 or v.tags && v_tags)
      and (cardinality(v_amenities) = 0 or v.amenities && v_amenities)
      and (cardinality(v_services) = 0 or v.services && v_services)
      and (cardinality(v_access) = 0 or v.accessibility_attributes && v_access)
      and (cardinality(v_groups) = 0 or v.target_groups && v_groups)
      and (v_price is null or v.price_range = v_price)
  ), filtered as (
    select b.* from base b
    where v_radius_km is null or b.dist_m is null or b.dist_m <= v_radius_km * 1000
  ), scored as (
    select f.*,
      (case when f.dist_m is null then 0.3
            else exp(-power(f.dist_m / 30000.0, 2)) end)::numeric as s_distance,
      least(1.0::numeric,
        case when cardinality(v_prefs_categories) > 0 and f.category = any(v_prefs_categories) then 0.5 else 0 end
        + case when cardinality(v_prefs_tags) > 0 and f.tags && v_prefs_tags then 0.3 else 0 end
        + case when cardinality(v_prefs_groups) > 0 and f.target_groups && v_prefs_groups then 0.2 else 0 end
      )::numeric as s_interest,
      (case when cardinality(v_behavior_cats) > 0 and f.category = any(v_behavior_cats)
             then 1.0 else 0.0 end)::numeric as s_behavior,
      least(1.0::numeric,
        (case f.quality_tier when 'verified' then 0.70 when 'guide_ready' then 0.60
          when 'listed' then 0.15 else 0 end)::numeric
        + (coalesce(f.public_quality_score, 0)::numeric / 100 * 0.25)
        + (case when f.is_featured then 0.05 else 0 end)::numeric
      ) as s_quality,
      greatest(0.0::numeric,
        1.0::numeric - (ln(greatest(1, extract(day from (now() - f.created_at))::integer)) / ln(365))::numeric
      ) as s_recency
    from filtered f
  ), ranked_rows as (
    select s.*,
      (v_w_distance * s.s_distance + v_w_interest * s.s_interest
       + v_w_behavior * s.s_behavior + v_w_quality * s.s_quality
       + v_w_recency * s.s_recency)::numeric as relevance,
      case s.quality_tier when 'verified' then 3 when 'guide_ready' then 2
        when 'listed' then 1 else 0 end as tier_rank
    from scored s
  )
  select
    to_jsonb(r) - 's_distance' - 's_interest' - 's_behavior' - 's_quality'
      - 's_recency' - 'relevance' - 'dist_m' - 'tier_rank' as venue,
    r.relevance, r.dist_m, v_total
  from ranked_rows r
  order by
    case when p_sort in ('relevance', 'featured') then r.tier_rank end desc nulls last,
    case when p_sort = 'name' then r.name end asc nulls last,
    case when p_sort = 'category' then r.category end asc nulls last,
    case when p_sort = 'city' then r.city end asc nulls last,
    case when p_sort = 'created_at' then r.created_at end desc nulls last,
    case when p_sort = 'featured' then r.is_featured::integer end desc,
    case when p_sort = 'nearest' then r.dist_m end asc nulls last,
    case when p_sort = 'relevance' then r.relevance end desc nulls last,
    r.relevance desc nulls last, r.id
  limit greatest(1, least(coalesce(p_limit, 24), 100))
  offset greatest(0, coalesce(p_offset, 0));
end;
$ranked$;

revoke all on function public.rpc_venues_ranked(uuid, numeric, numeric, jsonb, text, integer, integer) from public;

grant execute on function public.rpc_venues_ranked(uuid, numeric, numeric, jsonb, text, integer, integer)
  to anon, authenticated, service_role;
