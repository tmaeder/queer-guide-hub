begin;
set local lock_timeout = '30s';
-- Event writes can enqueue venue work while venue writes propagate into events.
-- Acquire this pair in that dependency order before the repair to avoid a
-- production deadlock with concurrent ingestion.
lock table public.events,public.venues in access exclusive mode;

-- Countries data-quality programme.
--
-- Canonical narrative: countries.description. editorial_long remains a
-- compatibility projection for one release. Subjective changes are queued;
-- deterministic publication, geography and relationship invariants fail closed.

create extension if not exists pgcrypto;

alter table public.countries
  add column if not exists field_provenance jsonb not null default '{}'::jsonb;

alter table public.editorial_drafts
  add column if not exists citations jsonb not null default '[]'::jsonb,
  add column if not exists source_hash text;

alter table public.image_assets
  add column if not exists health_checked_at timestamptz,
  add column if not exists health_http_status integer,
  add column if not exists health_content_type text,
  add column if not exists health_consecutive_failures integer not null default 0,
  add column if not exists health_error text;

alter table public.image_assets
  drop constraint if exists image_assets_health_consecutive_failures_check;
alter table public.image_assets
  add constraint image_assets_health_consecutive_failures_check
  check (health_consecutive_failures >= 0);

comment on column public.countries.field_provenance is
  'Field-keyed provenance: source, source_ref/source_url, observed_at, imported_at, method and optional source_hash.';
comment on column public.editorial_drafts.citations is
  'Reviewer-visible source citations. Country publication requires at least one citation.';

-- Best-effort provenance for data that predates field-level tracking. This does
-- not invent a URL or observation date; unknown parts remain explicitly absent.
update public.countries c
set field_provenance = c.field_provenance
  || jsonb_strip_nulls(jsonb_build_object(
    'identity', case when nullif(btrim(c.data_source), '') is not null then jsonb_build_object(
      'source', c.data_source, 'imported_at', coalesce(c.last_synced_at, c.updated_at),
      'method', 'legacy_backfill') end,
    'rights', case when c.enrichment_status->'lgbti_rights'->>'source' is not null
      or c.lgbti_data_last_updated is not null then jsonb_build_object(
        'source', coalesce(c.enrichment_status->'lgbti_rights'->>'source', 'ilga'),
        'observed_at', c.lgbti_data_last_updated, 'imported_at', c.lgbti_data_last_updated,
        'method', coalesce(c.enrichment_status->'lgbti_rights'->>'state', 'imported')) end,
    'image_url', case when coalesce(nullif(btrim(c.curated_image_url), ''), nullif(btrim(c.image_url), '')) is not null
      then jsonb_build_object(
        'source', coalesce(c.image_metadata->>'source', case when c.curated_image_url is not null then 'curated' else c.data_source end),
        'source_url', coalesce(c.curated_image_url, c.image_url),
        'imported_at', coalesce(c.image_metadata->>'fetched_at', c.updated_at::text),
        'method', case when c.curated_image_url is not null then 'human_selected' else 'legacy_backfill' end) end
  ))
where c.duplicate_of_id is null;

-- Preserve every review-state public value before retracting it. The NOT EXISTS
-- guard makes this safe to re-run even though the historical unique constraint
-- is deferrable.
insert into public.editorial_drafts
  (entity_type, entity_id, draft_hook, draft_long, status, model, reviewer_note, citations, source_hash)
select 'country'::public.editorial_entity_type, c.id, c.editorial_hook,
       coalesce(c.editorial_long, c.description), 'pending'::public.editorial_draft_status,
       'legacy-country-remediation', 'Preserved from a review-state public row before retraction.',
       '[]'::jsonb,
       encode(extensions.digest(coalesce(c.editorial_long, c.description, ''), 'sha256'), 'hex')
from public.countries c
where c.duplicate_of_id is null
  and c.enrichment_status->'editorial'->>'state' = 'review'
  and (nullif(btrim(c.editorial_hook), '') is not null
       or nullif(btrim(c.editorial_long), '') is not null
       or nullif(btrim(c.description), '') is not null)
  and not exists (
    select 1 from public.editorial_drafts d
    where d.entity_type = 'country' and d.entity_id = c.id and d.status = 'pending'
  );

update public.countries
set editorial_hook = null,
    editorial_long = null,
    description = null,
    updated_at = now()
where duplicate_of_id is null
  and enrichment_status->'editorial'->>'state' = 'review'
  and (editorial_hook is not null or editorial_long is not null or description is not null);

-- Country drafts are always human-reviewed. Approval atomically writes the
-- canonical narrative, compatibility mirror, citations and provenance.
create or replace function public.approve_editorial_draft(p_draft_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
  d public.editorial_drafts%rowtype;
  v_at timestamptz := now();
  v_hash text;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'unauthorized';
  end if;

  select * into d from public.editorial_drafts where id = p_draft_id for update;
  if not found then raise exception 'draft not found'; end if;
  if d.status <> 'pending' then raise exception 'draft is not pending'; end if;

  if d.entity_type = 'country' then
    if nullif(btrim(d.draft_long), '') is null then
      raise exception 'country draft requires a canonical description';
    end if;
    if jsonb_typeof(d.citations) <> 'array' or jsonb_array_length(d.citations) = 0 then
      raise exception 'country draft requires at least one citation';
    end if;
    v_hash := encode(extensions.digest(d.draft_long, 'sha256'), 'hex');
    update public.countries c set
      description = d.draft_long,
      editorial_hook = nullif(btrim(d.draft_hook), ''),
      editorial_long = d.draft_long,
      description_i18n = case
        when c.description is distinct from d.draft_long then '{}'::jsonb
        else c.description_i18n end,
      field_provenance = c.field_provenance || jsonb_build_object(
        'description', jsonb_build_object(
          'source', 'editorial_draft', 'source_ref', d.id, 'source_hash', v_hash,
          'observed_at', d.generated_at, 'imported_at', v_at, 'method', 'human_approved',
          'citations', d.citations),
        'editorial_hook', jsonb_build_object(
          'source', 'editorial_draft', 'source_ref', d.id,
          'imported_at', v_at, 'method', 'human_approved')),
      enrichment_status = jsonb_set(coalesce(c.enrichment_status, '{}'::jsonb), '{editorial}',
        jsonb_build_object('state', 'published', 'draft_id', d.id, 'at', v_at,
                           'reviewer_id', auth.uid(), 'source_hash', v_hash), true),
      updated_at = v_at
    where c.id = d.entity_id;

    update public.ai_suggestions
    set status = 'rejected',
        review_notes = concat_ws(E'\n', review_notes, 'Superseded: approved English country description changed.')
    where entity_type = 'countries' and entity_id = d.entity_id
      and suggestion_type = 'translation' and status = 'pending';
  elsif d.entity_type = 'city' then
    update public.cities set editorial_hook = coalesce(nullif(btrim(d.draft_hook), ''), editorial_hook)
    where id = d.entity_id;
  elsif d.entity_type = 'village' then
    update public.queer_villages set editorial_hook = coalesce(nullif(btrim(d.draft_hook), ''), editorial_hook)
    where id = d.entity_id;
  end if;

  update public.editorial_drafts set
    status = 'published', reviewer_id = auth.uid(), reviewed_at = v_at,
    published_at = v_at, source_hash = coalesce(source_hash, v_hash)
  where id = p_draft_id;
end
$function$;
revoke all on function public.approve_editorial_draft(uuid) from public, anon;
grant execute on function public.approve_editorial_draft(uuid) to authenticated;

create or replace function public.country_rights_accounted(p_country public.countries)
returns boolean language sql stable set search_path = public, pg_temp as $function$
  select p_country.enrichment_status->'lgbti_rights'->>'state' is not null
      or (p_country.lgbti_data_last_updated is not null
          and p_country.lgbti_data_last_updated >= now() - interval '30 days')
$function$;

create or replace function public.country_meets_publishability(p_country public.countries)
returns boolean language sql stable set search_path = public, pg_temp as $function$
  select p_country.duplicate_of_id is null
     and nullif(btrim(p_country.name), '') is not null
     and p_country.code ~ '^[A-Z]{2,3}$'
     and nullif(btrim(p_country.slug), '') is not null
     and p_country.continent_id is not null
     and p_country.latitude between -90 and 90
     and p_country.longitude between -180 and 180
     and public.country_rights_accounted(p_country)
     and (p_country.shell_status = 'real'
          or p_country.enrichment_status->'seo'->>'override' = 'approved')
$function$;

create or replace view public.country_sitemap_entries
with (security_invoker = true)
as
select c.slug,c.updated_at
from public.countries c
where c.seo_indexable and public.country_meets_publishability(c);
revoke all on public.country_sitemap_entries from public;
grant select on public.country_sitemap_entries to anon,authenticated,service_role;

create or replace function public.tg_country_publication_guard()
returns trigger language plpgsql set search_path = public, pg_temp as $function$
begin
  if new.seo_indexable and not public.country_meets_publishability(new) then
    new.seo_indexable := false;
    new.enrichment_status := jsonb_set(coalesce(new.enrichment_status, '{}'::jsonb), '{seo}',
      coalesce(new.enrichment_status->'seo', '{}'::jsonb)
      || jsonb_build_object('state', 'blocked', 'reason', 'country_publishability', 'at', now()), true);
  end if;
  return new;
end
$function$;

drop trigger if exists country_publication_guard on public.countries;
create trigger country_publication_guard
before insert or update of seo_indexable, shell_status, code, slug, continent_id,
  latitude, longitude, lgbti_data_last_updated, enrichment_status, duplicate_of_id
on public.countries for each row execute function public.tg_country_publication_guard();

-- Territories remain reachable but are crawler-ineligible unless explicitly reviewed.
update public.countries
set seo_indexable = false,
    enrichment_status = jsonb_set(coalesce(enrichment_status, '{}'::jsonb), '{seo}',
      coalesce(enrichment_status->'seo', '{}'::jsonb)
      || jsonb_build_object('state', 'noindex', 'reason', 'territory_default', 'at', now()), true)
where shell_status = 'territory'
  and enrichment_status->'seo'->>'override' is distinct from 'approved';

-- Hierarchy integrity: a region may only belong to the country's continent.
create or replace function public.tg_country_region_guard()
returns trigger language plpgsql set search_path = public, pg_temp as $function$
begin
  if new.region_id is not null and not exists (
    select 1 from public.regions r where r.id = new.region_id and r.continent_id = new.continent_id
  ) then
    raise exception 'country region must belong to country continent';
  end if;
  return new;
end
$function$;
drop trigger if exists country_region_guard on public.countries;
create trigger country_region_guard before insert or update of region_id, continent_id
on public.countries for each row execute function public.tg_country_region_guard();

-- Exact subregion matches from already-staged trusted source rows. Ambiguous or
-- absent values are recorded for review rather than guessed.
with latest as (
  select distinct on (upper(coalesce(normalized_data->'metadata'->>'code', source_entity_id)))
    upper(coalesce(normalized_data->'metadata'->>'code', source_entity_id)) as code,
    nullif(btrim(normalized_data->'metadata'->>'subregion'), '') as subregion,
    created_at
  from public.ingestion_staging
  where target_table = 'countries' and source_name = 'rest-countries'
  order by upper(coalesce(normalized_data->'metadata'->>'code', source_entity_id)), created_at desc
), exact_match as (
  select c.id, r.id as region_id, l.subregion
  from latest l join public.countries c on c.code = l.code
  join public.regions r on lower(btrim(r.name)) = lower(btrim(l.subregion))
                       and r.continent_id = c.continent_id
  where c.region_id is null
)
update public.countries c set
  region_id = m.region_id,
  field_provenance = c.field_provenance || jsonb_build_object('region_id', jsonb_build_object(
    'source', 'rest-countries', 'source_ref', m.subregion, 'imported_at', now(), 'method', 'exact_mapping')),
  enrichment_status = jsonb_set(coalesce(c.enrichment_status, '{}'::jsonb), '{region}',
    jsonb_build_object('state', 'derived', 'source', 'rest-countries', 'value', m.subregion, 'at', now()), true)
from exact_match m where c.id = m.id;

update public.countries c set enrichment_status = jsonb_set(
  coalesce(c.enrichment_status, '{}'::jsonb), '{region}',
  jsonb_build_object('state', case when c.shell_status = 'territory' then 'not_applicable' else 'review' end,
                     'reason', case when c.shell_status = 'territory' then 'territory_without_internal_region' else 'no_exact_trusted_subregion_match' end,
                     'at', now()), true)
where c.region_id is null and c.enrichment_status->'region'->>'state' is null;

create or replace function public.apply_country_subregions_from_staging()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $function$
declare v_changed integer := 0;
begin
  with latest as (
    select distinct on (upper(coalesce(normalized_data->'metadata'->>'code', source_entity_id)))
      upper(coalesce(normalized_data->'metadata'->>'code', source_entity_id)) code,
      nullif(btrim(normalized_data->'metadata'->>'subregion'), '') subregion
    from public.ingestion_staging
    where target_table='countries' and source_name='rest-countries'
    order by upper(coalesce(normalized_data->'metadata'->>'code', source_entity_id)),created_at desc
  ), matches as (
    select c.id,r.id region_id,l.subregion from latest l join public.countries c on c.code=l.code
    join public.regions r on lower(btrim(r.name))=lower(btrim(l.subregion)) and r.continent_id=c.continent_id
    where c.region_id is distinct from r.id
  )
  update public.countries c set region_id=m.region_id,
    field_provenance=c.field_provenance||jsonb_build_object('region_id',jsonb_build_object(
      'source','rest-countries','source_ref',m.subregion,'imported_at',now(),'method','exact_mapping')),
    enrichment_status=jsonb_set(coalesce(c.enrichment_status,'{}'::jsonb),'{region}',jsonb_build_object(
      'state','derived','source','rest-countries','value',m.subregion,'at',now()),true)
  from matches m where c.id=m.id;
  get diagnostics v_changed=row_count;
  return jsonb_build_object('updated',v_changed);
end
$function$;
revoke all on function public.apply_country_subregions_from_staging() from public,anon,authenticated;
grant execute on function public.apply_country_subregions_from_staging() to service_role;

-- Existing and future deterministic relationship repairs.
update public.events e set
  city_id = coalesce(v.city_id, e.city_id), country_id = coalesce(v.country_id, e.country_id),
  geo_linked_at = now(),
  field_provenance = coalesce(e.field_provenance, '{}'::jsonb) || jsonb_build_object(
    'country_id', jsonb_build_object('source', 'venue', 'source_ref', v.id, 'imported_at', now(), 'method', 'foreign_key_derivation'))
from public.venues v
where e.venue_id = v.id
  and (e.country_id is distinct from v.country_id
       or (v.city_id is not null and e.city_id is distinct from v.city_id));

update public.personalities p set
  country_id = c.country_id, geo_linked_at = now(),
  field_provenance = coalesce(p.field_provenance, '{}'::jsonb) || jsonb_build_object(
    'country_id', jsonb_build_object('source', 'birthplace_city', 'source_ref', c.id,
      'imported_at', now(), 'method', 'foreign_key_derivation'))
from public.cities c
where p.city_id = c.id and p.country_id is distinct from c.country_id;

-- A linked city is the authoritative country for ordinary place/content rows.
-- These repairs are exact foreign-key derivations, so they do not require an
-- editorial decision. Personalities and venue-backed events have dedicated
-- provenance-aware paths below.
update public.venues x set country_id=c.country_id,geo_linked_at=now()
from public.cities c where x.city_id=c.id and x.country_id is distinct from c.country_id;
update public.hotels x set country_id=c.country_id,geo_linked_at=now()
from public.cities c where x.city_id=c.id and x.country_id is distinct from c.country_id;
update public.organizations x set country_id=c.country_id
from public.cities c where x.city_id=c.id and x.country_id is distinct from c.country_id;
update public.queer_villages x set country_id=c.country_id
from public.cities c where x.city_id=c.id and x.country_id is distinct from c.country_id;

-- Venue country repair can change the authoritative value consumed above, so
-- reconcile venue-backed events once more in dependency order.
update public.events e set
  city_id=coalesce(v.city_id,e.city_id),country_id=coalesce(v.country_id,e.country_id),
  geo_linked_at=now(),
  field_provenance=coalesce(e.field_provenance,'{}'::jsonb)||jsonb_build_object(
    'country_id',jsonb_build_object('source','venue','source_ref',v.id,
      'imported_at',now(),'method','foreign_key_derivation'))
from public.venues v
where e.venue_id=v.id and (e.country_id is distinct from v.country_id
  or (v.city_id is not null and e.city_id is distinct from v.city_id));

create or replace function public.tg_city_country_derivation()
returns trigger language plpgsql set search_path = public, pg_temp as $function$
declare v_country_id uuid;
begin
  if new.city_id is null then return new; end if;
  select country_id into v_country_id from public.cities where id=new.city_id;
  if v_country_id is not null then new.country_id:=v_country_id; end if;
  return new;
end
$function$;

drop trigger if exists venue_city_country_derivation on public.venues;
create trigger venue_city_country_derivation before insert or update of city_id,country_id on public.venues
for each row execute function public.tg_city_country_derivation();
drop trigger if exists hotel_city_country_derivation on public.hotels;
create trigger hotel_city_country_derivation before insert or update of city_id,country_id on public.hotels
for each row execute function public.tg_city_country_derivation();
drop trigger if exists organization_city_country_derivation on public.organizations;
create trigger organization_city_country_derivation before insert or update of city_id,country_id on public.organizations
for each row execute function public.tg_city_country_derivation();
drop trigger if exists village_city_country_derivation on public.queer_villages;
create trigger village_city_country_derivation before insert or update of city_id,country_id on public.queer_villages
for each row execute function public.tg_city_country_derivation();

-- Re-run after installing the authoritative trigger because legacy geo-derive
-- triggers can rewrite country_id during the first repair pass.
update public.venues x set country_id=c.country_id,geo_linked_at=now()
from public.cities c where x.city_id=c.id and x.country_id is distinct from c.country_id;
update public.hotels x set country_id=c.country_id,geo_linked_at=now()
from public.cities c where x.city_id=c.id and x.country_id is distinct from c.country_id;
update public.organizations x set country_id=c.country_id
from public.cities c where x.city_id=c.id and x.country_id is distinct from c.country_id;
update public.queer_villages x set country_id=c.country_id
from public.cities c where x.city_id=c.id and x.country_id is distinct from c.country_id;
update public.events e set city_id=coalesce(v.city_id,e.city_id),country_id=coalesce(v.country_id,e.country_id),
  geo_linked_at=now() from public.venues v
where e.venue_id=v.id and (e.country_id is distinct from v.country_id
  or (v.city_id is not null and e.city_id is distinct from v.city_id));

-- Do not leave a null geography semantically unexplained. The review state is
-- a terminal disposition until an editor resolves it to global, unknown or N/A.
update public.venues set enrichment_status=jsonb_set(coalesce(enrichment_status,'{}'::jsonb),
  '{geography}',jsonb_build_object('state','review','reason','country_and_city_missing','at',now()),true)
where duplicate_of_id is null and city_id is null and country_id is null
  and enrichment_status->'geography'->>'state' is null;
update public.events set enrichment_status=jsonb_set(coalesce(enrichment_status,'{}'::jsonb),
  '{geography}',jsonb_build_object('state','review','reason','country_city_and_venue_missing','at',now()),true)
where duplicate_of_id is null and city_id is null and country_id is null and venue_id is null
  and enrichment_status->'geography'->>'state' is null;
update public.organizations set enrichment_status=jsonb_set(coalesce(enrichment_status,'{}'::jsonb),
  '{geography}',jsonb_build_object('state','review','reason','country_and_city_missing','at',now()),true)
where duplicate_of_id is null and city_id is null and country_id is null
  and enrichment_status->'geography'->>'state' is null;
update public.personalities set enrichment_status=jsonb_set(coalesce(enrichment_status,'{}'::jsonb),
  '{geography}',jsonb_build_object('state','review','reason','birth_country_and_city_missing','at',now()),true)
where duplicate_of_id is null and city_id is null and country_id is null
  and enrichment_status->'geography'->>'state' is null;

create or replace function public.tg_event_venue_geography()
returns trigger language plpgsql set search_path = public, pg_temp as $function$
declare v record; v_city_country_id uuid;
begin
  if new.venue_id is null then return new; end if;
  select venue.city_id,venue.country_id,country.code country_code into v
  from public.venues venue left join public.countries country on country.id=venue.country_id
  where venue.id = new.venue_id;
  if found then
    if v.city_id is not null then
      new.city_id := v.city_id;
    elsif new.city_id is not null and v.country_id is not null then
      select country_id into v_city_country_id from public.cities where id=new.city_id;
      if v_city_country_id is distinct from v.country_id then
        new.city_id := null;
        new.enrichment_status := jsonb_set(coalesce(new.enrichment_status,'{}'::jsonb),'{geography}',
          jsonb_build_object('state','review','reason','venue_country_contradicted_previous_city','at',now()),true);
      end if;
    end if;
    new.country_id := coalesce(v.country_id, new.country_id);
    new.country := coalesce(v.country_code,new.country);
    new.geo_linked_at := now();
    new.field_provenance := coalesce(new.field_provenance, '{}'::jsonb) || jsonb_build_object(
      'country_id', jsonb_build_object('source', 'venue', 'source_ref', new.venue_id,
        'imported_at', now(), 'method', 'foreign_key_derivation'));
  end if;
  return new;
end
$function$;
drop trigger if exists event_venue_geography on public.events;
drop trigger if exists zzz_event_venue_geography on public.events;
create trigger zzz_event_venue_geography before insert or update of venue_id, city_id, country_id on public.events
for each row execute function public.tg_event_venue_geography();

-- Fire the final-order trigger for every venue-backed contradiction. When the
-- venue has no city, a conflicting inherited city is cleared and queued rather
-- than inventing a cross-country city linkage.
update public.events e set country_id=coalesce(v.country_id,e.country_id)
from public.venues v
where e.venue_id=v.id and (
  e.country_id is distinct from v.country_id
  or (v.city_id is not null and e.city_id is distinct from v.city_id)
  or (v.city_id is null and e.city_id is not null and v.country_id is not null and exists(
    select 1 from public.cities c where c.id=e.city_id and c.country_id is distinct from v.country_id))
);

create or replace function public.tg_personality_birthplace_geography()
returns trigger language plpgsql set search_path = public, pg_temp as $function$
declare v_country_id uuid;
begin
  if new.city_id is null then return new; end if;
  select country_id into v_country_id from public.cities where id = new.city_id;
  if v_country_id is not null then
    new.country_id := v_country_id;
    new.geo_linked_at := now();
    new.field_provenance := coalesce(new.field_provenance, '{}'::jsonb) || jsonb_build_object(
      'country_id', jsonb_build_object('source', 'birthplace_city', 'source_ref', new.city_id,
        'imported_at', now(), 'method', 'foreign_key_derivation'));
  end if;
  return new;
end
$function$;
drop trigger if exists personality_birthplace_geography on public.personalities;
create trigger personality_birthplace_geography before insert or update of city_id, country_id on public.personalities
for each row execute function public.tg_personality_birthplace_geography();

-- Every event left on the catch-all type is reviewable. This is a disposition
-- queue, not an automatic reclassification: lack of evidence may legitimately
-- end in an approved `other` outcome.
insert into public.review_queue(entity_type,entity_id,review_type,status,details)
select 'event',e.id,'COUNTRY_CATEGORY_UNCLASSIFIED','pending',jsonb_build_object(
  'country_id',e.country_id,'current','other','resolution','human_classification_or_intentional_other')
from public.events e
where e.duplicate_of_id is null and coalesce(e.event_type,'other')='other'
  and not (coalesce(e.enrichment_status,'{}'::jsonb)?'event_type_backfill')
  and not exists(select 1 from public.review_queue q where q.entity_type='event' and q.entity_id=e.id
    and q.review_type='COUNTRY_CATEGORY_UNCLASSIFIED' and q.status='pending');

-- Register current country covers in the shared asset registry. Subjective
-- replacement remains in ai_suggestions; this is only a compatibility link.
create or replace function public.tg_countries_sync_image_assets()
returns trigger language plpgsql security definer set search_path = public, extensions, pg_temp as $function$
declare v_url text;
begin
  v_url := coalesce(nullif(btrim(new.curated_image_url), ''),
                    case when not coalesce(new.image_flagged, false) then nullif(btrim(new.image_url), '') end);
  delete from public.image_asset_links where entity_type = 'country' and entity_id = new.id and role = 'cover';
  if v_url is not null then
    perform public._image_assets_upsert_link('country', new.id, v_url, 'cover',
      case when nullif(btrim(new.curated_image_url), '') is not null then 'country_curated_compat' else 'country_direct_compat' end);
    update public.image_assets ia set
      source = coalesce(nullif(new.image_metadata->>'source', ''), ia.source),
      source_ref = coalesce(nullif(new.image_metadata->>'source_url', ''), ia.source_ref),
      license = coalesce(nullif(new.image_metadata->>'license', ''), ia.license),
      attribution = coalesce(nullif(new.image_metadata->>'attribution', ''), ia.attribution)
    from public.image_asset_links l
    where l.asset_id = ia.id and l.entity_type = 'country' and l.entity_id = new.id and l.role = 'cover';
  end if;
  return new;
exception when others then
  raise warning 'country image registry sync failed for %: %', new.id, sqlerrm;
  return new;
end
$function$;
drop trigger if exists countries_sync_image_assets on public.countries;
create trigger countries_sync_image_assets after insert or update of curated_image_url, image_url, image_flagged, image_metadata
on public.countries for each row execute function public.tg_countries_sync_image_assets();

do $backfill$
declare r record;
begin
  for r in select id,
      coalesce(nullif(btrim(curated_image_url), ''), case when not image_flagged then nullif(btrim(image_url), '') end) as url,
      nullif(btrim(curated_image_url), '') is not null as curated
    from public.countries where duplicate_of_id is null
  loop
    if r.url is not null then
      delete from public.image_asset_links where entity_type='country' and entity_id=r.id and role='cover';
      perform public._image_assets_upsert_link('country', r.id, r.url, 'cover',
        case when r.curated then 'country_curated_compat' else 'country_direct_compat' end);
    end if;
  end loop;
end
$backfill$;

-- Queer relevance cannot be inferred safely from a reachable image. Queue the
-- decision once per country and keep the existing cover visible until reviewed.
insert into public.ai_suggestions
  (suggestion_type,entity_type,entity_id,proposed_value,current_value,source,confidence,status,review_notes)
select 'image_replacement','country',c.id,
  jsonb_build_object('action','review_country_cover_relevance'),
  jsonb_build_object('url',coalesce(c.curated_image_url,c.image_url),'metadata',coalesce(c.image_metadata,'{}'::jsonb)),
  'rule',1,'pending','Confirm queer relevance or approve a documented exception.'
from public.countries c
where c.duplicate_of_id is null
  and coalesce(nullif(btrim(c.curated_image_url),''),nullif(btrim(c.image_url),'')) is not null
  and coalesce(c.image_metadata->>'relevance_review','') not in ('approved','exception_approved')
  and not exists(select 1 from public.ai_suggestions s where s.entity_type='country' and s.entity_id=c.id
    and s.suggestion_type='image_replacement' and s.status='pending'
    and s.proposed_value->>'action'='review_country_cover_relevance');

-- Multidimensional contract. The view is authenticated-only; the RPC below is
-- the stable dashboard/API interface.
create or replace view public.country_quality_profile
with (security_invoker = true)
as
with image_facts as (
  select l.entity_id as country_id,
    bool_or(ia.status='active' and not ia.is_flagged) as active_image,
    bool_or(ia.status='active' and not ia.is_flagged and ia.health_consecutive_failures < 2) as healthy_image,
    bool_or(nullif(btrim(ia.source), '') is not null and nullif(btrim(ia.license), '') is not null) as image_provenance,
    bool_or(ia.url ~* '/storage/v1/object/public/' or coalesce(ia.metadata->>'stored_locally','false')='true') as locally_hosted,
    bool_or(coalesce(ia.metadata->>'relevance_review','') in ('approved','exception_approved')) as relevance_approved,
    max(ia.health_checked_at) as image_checked_at,
    max(ia.phash) filter (where ia.phash is not null) as phash,
    max(ia.content_hash) filter (where ia.content_hash is not null) as content_hash
  from public.image_asset_links l join public.image_assets ia on ia.id=l.asset_id
  where l.entity_type='country' and l.role='cover' group by l.entity_id
), relationship_issues as (
  select coalesce(v.country_id,x.country_id) country_id,'city' kind from public.venues v join public.cities x on x.id=v.city_id where v.country_id is distinct from x.country_id
  union all select coalesce(e.country_id,x.country_id),'city' from public.events e join public.cities x on x.id=e.city_id where e.country_id is distinct from x.country_id
  union all select coalesce(p.country_id,x.country_id),'city' from public.personalities p join public.cities x on x.id=p.city_id where p.country_id is distinct from x.country_id
  union all select coalesce(h.country_id,x.country_id),'city' from public.hotels h join public.cities x on x.id=h.city_id where h.country_id is distinct from x.country_id
  union all select coalesce(v.country_id,x.country_id),'city' from public.queer_villages v join public.cities x on x.id=v.city_id where v.country_id is distinct from x.country_id
  union all select coalesce(o.country_id,x.country_id),'city' from public.organizations o join public.cities x on x.id=o.city_id where o.country_id is distinct from x.country_id
  union all select coalesce(e.country_id,v.country_id),'event_venue' from public.events e join public.venues v on v.id=e.venue_id where e.country_id is distinct from v.country_id
), relationship_rollup as (
  select country_id,count(*) filter(where kind='city')::integer relationship_mismatches,
    count(*) filter(where kind='event_venue')::integer event_venue_mismatches
  from relationship_issues where country_id is not null group by country_id
), category_rollup as (
  select country_id,count(*) filter(where kind='venue')::integer other_venues,
    count(*) filter(where kind='event')::integer other_events
  from (
    select v.country_id,'venue' kind from public.venues v
    where coalesce(v.category,'other')='other' and not (coalesce(v.enrichment_status,'{}'::jsonb)?'category_backfill')
    union all
    select e.country_id,'event' from public.events e
    where coalesce(e.event_type,'other')='other' and not (coalesce(e.enrichment_status,'{}'::jsonb)?'event_type_backfill')
      and not exists(select 1 from public.review_queue q where q.entity_type='event' and q.entity_id=e.id
        and q.review_type='COUNTRY_CATEGORY_UNCLASSIFIED' and q.status in ('accepted','resolved','rejected'))
  ) s where country_id is not null group by country_id
), relationship_facts as (
  select c.id country_id,0::integer city_hierarchy_mismatches,
    coalesce(r.relationship_mismatches,0) relationship_mismatches,
    coalesce(r.event_venue_mismatches,0) event_venue_mismatches,
    coalesce(cr.other_venues,0) other_venues,coalesce(cr.other_events,0) other_events
  from public.countries c left join relationship_rollup r on r.country_id=c.id
  left join category_rollup cr on cr.country_id=c.id where c.duplicate_of_id is null
), base as (
  select c.*, c as country_row, r.continent_id as region_continent_id,
    coalesce((select count(*) from jsonb_object_keys(coalesce(c.description_i18n,'{}'::jsonb))),0)::integer as translation_count,
    coalesce(i.active_image,false) as active_image, coalesce(i.healthy_image,false) as healthy_image,
    coalesce(i.image_provenance,false) as image_provenance, coalesce(i.locally_hosted,false) as locally_hosted,
    coalesce(i.relevance_approved,false)
      or coalesce(c.image_metadata->>'relevance_review','') in ('approved','exception_approved') as relevance_approved,
    i.image_checked_at, i.phash, i.content_hash,
    rf.city_hierarchy_mismatches, rf.relationship_mismatches, rf.event_venue_mismatches,
    rf.other_venues, rf.other_events
  from public.countries c left join public.regions r on r.id=c.region_id
  left join image_facts i on i.country_id=c.id
  join relationship_facts rf on rf.country_id=c.id
  where c.duplicate_of_id is null
), assessed as (
  select b.*,
    array_remove(array[
      case when b.code !~ '^[A-Z]{2,3}$' or nullif(btrim(b.slug),'') is null then 'COUNTRY_IDENTITY_INVALID' end,
      case when b.region_id is not null and b.region_continent_id is distinct from b.continent_id then 'COUNTRY_REGION_CONTINENT_MISMATCH' end,
      case when b.enrichment_status->'editorial'->>'state' <> 'published'
             and (b.editorial_hook is not null or b.editorial_long is not null or b.description is not null)
           then 'COUNTRY_EDITORIAL_REVIEW_LEAK' end,
      case when not public.country_rights_accounted(b.country_row) then 'COUNTRY_RIGHTS_UNACCOUNTED' end,
      case when b.seo_indexable and not public.country_meets_publishability(b.country_row) then 'COUNTRY_INDEXABILITY_INVALID' end,
      case when b.seo_indexable and (not b.healthy_image or not b.locally_hosted) then 'COUNTRY_IMAGE_UNSAFE' end,
      case when b.city_hierarchy_mismatches+b.relationship_mismatches+b.event_venue_mismatches>0 then 'COUNTRY_LINK_MISMATCH' end
    ],null)::text[] as blockers,
    array_remove(array[
      case when b.region_id is null and b.enrichment_status->'region'->>'state' is null then 'COUNTRY_REGION_UNDISPOSITIONED' end,
      case when b.enrichment_status->'editorial'->>'state'='published' and nullif(btrim(b.description),'') is null then 'COUNTRY_DESCRIPTION_MISSING' end,
      case when b.seo_indexable and not b.image_provenance then 'COUNTRY_IMAGE_PROVENANCE_MISSING' end,
      case when b.seo_indexable and not b.relevance_approved then 'COUNTRY_IMAGE_RELEVANCE_UNREVIEWED' end,
      case when b.content_hash is not null and exists (
        select 1 from base x where x.id<>b.id and x.content_hash=b.content_hash
      ) then 'COUNTRY_IMAGE_DUPLICATE' end,
      case when b.seo_indexable and b.translation_count < 10 then 'COUNTRY_TRANSLATIONS_INCOMPLETE' end,
      case when b.field_provenance='{}'::jsonb then 'COUNTRY_PROVENANCE_MISSING' end,
      case when b.other_venues+b.other_events>0 then 'COUNTRY_CATEGORY_UNEXAMINED' end,
      case when not exists (
        select 1 from public.country_rights_corroboration crc
        where crc.country_id=b.id and crc.source='us_state_dept_hrp'
          and crc.observed_at>=now()-interval '8 days'
          and crc.source_year~'^\d{4}$'
          and crc.source_year::integer>=extract(year from current_date)::integer-2
      ) then 'COUNTRY_CORROBORATION_STALE' end,
      case when b.image_checked_at is null or b.image_checked_at<now()-interval '8 days' then 'COUNTRY_IMAGE_HEALTH_STALE' end
    ],null)::text[] as warnings
  from base b
)
select a.id,a.name,a.slug,a.code,a.shell_status,a.seo_indexable,
  cardinality(a.blockers)=0 as publication_ready,
  a.blockers,a.warnings,a.blockers||a.warnings as issue_codes,
  (case when a.code~'^[A-Z]{2,3}$' and nullif(btrim(a.slug),'') is not null then 100 else 0 end)::smallint as identity_score,
  (case when a.region_id is not null and a.region_continent_id=a.continent_id then 100 when a.enrichment_status->'region'->>'state'='not_applicable' then 100 else 0 end)::smallint as hierarchy_score,
  (case when a.enrichment_status->'editorial'->>'state'='published' and nullif(btrim(a.description),'') is not null then 100 when a.enrichment_status->'editorial'->>'state'='review' then 30 else 0 end)::smallint as editorial_score,
  (case when public.country_rights_accounted(a.country_row) then 100 else 0 end)::smallint as rights_score,
  (case when a.healthy_image and a.locally_hosted and a.image_provenance then 100 when a.active_image then 40 else 0 end)::smallint as imagery_score,
  greatest(0,100-least(100,(a.city_hierarchy_mismatches+a.relationship_mismatches+a.event_venue_mismatches)*25))::smallint as relationships_score,
  (case when a.field_provenance='{}'::jsonb then 0 when a.field_provenance?'rights' and a.field_provenance?'identity' then 100 else 50 end)::smallint as provenance_score,
  least(100,a.translation_count*10)::smallint as translation_score,
  a.translation_count,a.city_hierarchy_mismatches,a.relationship_mismatches,a.event_venue_mismatches,
  a.other_venues,a.other_events,a.active_image,a.healthy_image,a.locally_hosted,a.image_provenance,
  a.relevance_approved,a.image_checked_at,a.content_completeness_score,a.updated_at
from assessed a;

revoke all on public.country_quality_profile from public, anon;
grant select on public.country_quality_profile to authenticated, service_role;

create or replace function public.country_quality_health()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $function$
  with q as materialized (select * from public.country_quality_profile),
  issues as (select issue_code,count(*)::integer affected
    from q cross join lateral unnest(q.issue_codes) as issue_code group by issue_code),
  dimensions as (
    select d.name,round(avg(d.score),1) average from q cross join lateral(values
      ('identity',q.identity_score),('hierarchy',q.hierarchy_score),('editorial',q.editorial_score),
      ('rights',q.rights_score),('imagery',q.imagery_score),('relationships',q.relationships_score),
      ('provenance',q.provenance_score),('translation',q.translation_score)) d(name,score)
    group by d.name
  )
  select jsonb_build_object(
    'probe_ok',true,'generated_at',now(),
    'totals',jsonb_build_object('countries',(select count(*) from q),'indexable',(select count(*) from q where seo_indexable),
      'publication_ready',(select count(*) from q where publication_ready),'blocked',(select count(*) from q where cardinality(blockers)>0)),
    'dimensions',coalesce((select jsonb_object_agg(name,average order by name) from dimensions),'{}'::jsonb),
    'issues',coalesce((select jsonb_object_agg(issue_code,affected order by issue_code) from issues),'{}'::jsonb),
    'backlogs',jsonb_build_object(
      'editorial_review',(select count(*) from public.editorial_drafts where entity_type='country' and status='pending'),
      'translation_review',(select count(*) from public.ai_suggestions where entity_type='countries' and suggestion_type='translation' and status='pending'),
      'image_review',(select count(*) from public.ai_suggestions where entity_type='country' and suggestion_type='image_replacement' and status='pending'),
      'category_other',(select sum(other_venues+other_events) from q),
      'region_review',(select count(*) from public.countries where duplicate_of_id is null and enrichment_status->'region'->>'state'='review'),
      'unresolved_geography',(
        (select count(*) from public.venues where duplicate_of_id is null and city_id is null and country_id is null)
        +(select count(*) from public.events where duplicate_of_id is null and city_id is null and country_id is null and venue_id is null)
        +(select count(*) from public.organizations where duplicate_of_id is null and city_id is null and country_id is null)
        +(select count(*) from public.personalities where duplicate_of_id is null and city_id is null and country_id is null)
        +(select count(*) from public.milestones where city_id is null and country_id is null)
      )),
    'samples',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'slug',slug,'blockers',blockers,'warnings',warnings))
      from (select * from q where cardinality(issue_codes)>0 order by cardinality(blockers) desc,name limit 30) s),'[]'::jsonb)
  )
$function$;
revoke all on function public.country_quality_health() from public, anon;
grant execute on function public.country_quality_health() to authenticated, service_role;

create or replace function public.country_quality_gate_checks()
returns table(gate text,severity text,failures bigint,detail jsonb)
language sql stable security definer set search_path = public,pg_temp as $function$
  select 'country_identity_invalid','critical',count(*),jsonb_build_object('rule','ISO code, slug and canonical identity must be valid')
  from public.country_quality_profile where 'COUNTRY_IDENTITY_INVALID'=any(blockers)
  union all select 'country_region_continent_mismatch','critical',count(*),jsonb_build_object('rule','region must belong to country continent')
  from public.country_quality_profile where 'COUNTRY_REGION_CONTINENT_MISMATCH'=any(blockers)
  union all select 'country_editorial_review_leak','critical',count(*),jsonb_build_object('rule','only published editorial state may expose prose')
  from public.country_quality_profile where 'COUNTRY_EDITORIAL_REVIEW_LEAK'=any(blockers)
  union all select 'country_rights_unaccounted','critical',count(*),jsonb_build_object('rule','fresh rights data or explicit disposition required')
  from public.country_quality_profile where 'COUNTRY_RIGHTS_UNACCOUNTED'=any(blockers)
  union all select 'country_indexability_invalid','critical',count(*),jsonb_build_object('rule','indexable countries must satisfy country_meets_publishability')
  from public.country_quality_profile where 'COUNTRY_INDEXABILITY_INVALID'=any(blockers)
  union all select 'country_link_mismatch','critical',count(*),jsonb_build_object('rule','child and parent country foreign keys must agree')
  from public.country_quality_profile where 'COUNTRY_LINK_MISMATCH'=any(blockers)
  union all select 'country_image_repeated_failure','critical',count(*),jsonb_build_object('rule','indexable cover may not fail two consecutive probes')
  from public.country_quality_profile where seo_indexable and not healthy_image
  union all select 'country_import_provenance_missing','critical',count(*),jsonb_build_object('rule','canonical country rows require field provenance')
  from public.countries where duplicate_of_id is null and field_provenance='{}'::jsonb
  union all select 'country_image_not_local','high',count(*),jsonb_build_object('rule','indexable covers should be locally hosted or reviewed')
  from public.country_quality_profile where seo_indexable and not locally_hosted
  union all select 'country_translation_backlog','high',count(*),jsonb_build_object('rule','published canonical descriptions require all ten target locales')
  from public.country_quality_profile where seo_indexable and editorial_score=100 and translation_count<10
$function$;
revoke all on function public.country_quality_gate_checks() from public,anon,authenticated;
grant execute on function public.country_quality_gate_checks() to service_role;

insert into public.admin_automations
  (slug,name,description,managed_by,enabled,trigger,conditions,action,schedule)
values ('country_image_health','Country image health',
  'Weekly reachability and content-type probe for country cover assets; two failures queue human replacement review.',
  'system',true,'{"type":"schedule"}'::jsonb,'[]'::jsonb,
  jsonb_build_object('type','cron','jobname','country_image_health','command',$command$
    select net.http_post(
      url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/country-image-health',
      headers := jsonb_build_object('Content-Type','application/json','X-Internal-Secret',
        (select decrypted_secret from vault.decrypted_secrets where name='internal_invoke_secret')),
      body := '{"batch_limit":40}'::jsonb,
      timeout_milliseconds := 140000);
  $command$),'17 4 * * *')
on conflict (slug) do update set name=excluded.name,description=excluded.description,
  enabled=excluded.enabled,trigger=excluded.trigger,conditions=excluded.conditions,
  action=excluded.action,schedule=excluded.schedule,updated_at=now();

do $cron$
declare v_command text;
begin
  select action->>'command' into v_command from public.admin_automations where slug='country_image_health';
  if exists(select 1 from cron.job where jobname='country_image_health') then
    perform cron.unschedule('country_image_health');
  end if;
  perform cron.schedule('country_image_health','17 4 * * *',v_command);
end
$cron$;

-- Compatibility score: the previous 100-point formula counted the same prose
-- twice. Remove editorial_long and normalize the remaining 94 points to 100.
create or replace function public.country_completeness_value(c public.countries)
returns smallint language sql immutable set search_path = public, pg_temp as $function$
  select round(least(94, greatest(0,
      case when nullif(btrim(c.description),'') is not null or c.shell_status='territory' then 8 else 0 end
    + case when nullif(btrim(c.editorial_hook),'') is not null or c.shell_status='territory' then 6 else 0 end
    + case when c.capital is not null then 4 else 0 end + case when c.currency is not null then 3 else 0 end
    + case when array_length(c.languages,1)>0 then 3 else 0 end + case when c.population is not null then 3 else 0 end
    + case when c.area_km2 is not null then 3 else 0 end + case when c.flag_emoji is not null then 2 else 0 end
    + case when c.gdp_usd is not null or c.enrichment_status->'gdp_usd'->>'state'='data_unavailable' or c.shell_status='territory' then 3 else 0 end
    + case when c.gdp_per_capita_usd is not null or c.enrichment_status->'gdp_per_capita_usd'->>'state'='data_unavailable' or c.shell_status='territory' then 3 else 0 end
    + case when c.human_development_index is not null or c.enrichment_status->'human_development_index'->>'state'='data_unavailable' or c.shell_status='territory' then 3 else 0 end
    + case when c.life_expectancy is not null or c.enrichment_status->'life_expectancy'->>'state'='data_unavailable' or c.shell_status='territory' then 3 else 0 end
    + case when c.literacy_rate is not null or c.enrichment_status->'literacy_rate'->>'state'='data_unavailable' or c.shell_status='territory' then 3 else 0 end
    + case when c.equality_score is not null or c.enrichment_status->'equality_score'->>'state'='data_unavailable' then 9 else 0 end
    + case when coalesce(c.lgbti_criminalization,'{}'::jsonb)<>'{}'::jsonb or c.enrichment_status->'lgbti_criminalization'->>'state'='data_unavailable' then 9 else 0 end
    + case when coalesce(c.image_url,c.curated_image_url) is not null then 4 else 0 end
    + case when c.latitude is not null and c.longitude is not null then 4 else 0 end
    + case when c.calling_code is not null then 2 else 0 end + case when c.internet_tld is not null then 2 else 0 end
    + case when c.driving_side is not null then 2 else 0 end + case when c.timezone is not null then 2 else 0 end
    + case when c.government_type is not null then 2 else 0 end + case when array_length(c.major_airports,1)>0 then 2 else 0 end
    + case when c.national_day is not null then 1 else 0 end + case when array_length(c.climate_zones,1)>0 then 1 else 0 end
    + case when array_length(c.natural_resources,1)>0 then 1 else 0 end + case when array_length(c.unesco_sites,1)>0 then 1 else 0 end
    + case when array_length(c.major_industries,1)>0 then 1 else 0 end + case when array_length(c.exports,1)>0 then 1 else 0 end
    + case when array_length(c.imports,1)>0 then 1 else 0 end + case when coalesce(c.national_symbols,'{}'::jsonb)<>'{}'::jsonb then 1 else 0 end
    + case when array_length(c.major_religions,1)>0 then 1 else 0 end
  ))*100.0/94.0)::smallint
$function$;

create or replace function public.run_country_completeness_recompute()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $function$
declare
  v_automation_id uuid;
  v_run_id bigint;
  v_enabled boolean;
  v_started_at timestamptz := now();
  v_changed integer := 0;
  v_examined integer := 0;
begin
  select id, enabled into v_automation_id, v_enabled
  from public.admin_automations where slug='country_completeness_recompute';

  insert into public.admin_automation_runs
    (automation_id,automation_slug,started_at,status,items_examined,items_changed)
  values
    (v_automation_id,'country_completeness_recompute',v_started_at,'success',0,0)
  returning id into v_run_id;

  if v_enabled is distinct from true then
    update public.admin_automation_runs
    set finished_at=now(),summary=jsonb_build_object('skipped',true,'reason','paused')
    where id=v_run_id;
    update public.admin_automations
    set last_run_at=v_started_at,last_run_status='paused'
    where id=v_automation_id;
    return jsonb_build_object('skipped',true,'reason','paused');
  end if;

  with scored as (select id,public.country_completeness_value(c) score from public.countries c where duplicate_of_id is null)
  update public.countries c set content_completeness_score=s.score from scored s
  where c.id=s.id and c.content_completeness_score is distinct from s.score;
  get diagnostics v_changed=row_count;
  select count(*) into v_examined from public.countries where duplicate_of_id is null;
  update public.admin_automation_runs
  set finished_at=now(),items_examined=v_examined,items_changed=v_changed,
      summary=jsonb_build_object('rescored',v_changed,'examined',v_examined)
  where id=v_run_id;
  update public.admin_automations
  set last_run_at=v_started_at,last_run_status='success'
  where id=v_automation_id;
  return jsonb_build_object('rescored',v_changed,'examined',v_examined);
exception when others then
  update public.admin_automation_runs
  set finished_at=now(),status='error',error=sqlerrm
  where id=v_run_id;
  update public.admin_automations
  set last_run_at=v_started_at,last_run_status='error'
  where id=v_automation_id;
  raise;
end
$function$;
revoke all on function public.run_country_completeness_recompute() from public, anon, authenticated;
grant execute on function public.run_country_completeness_recompute() to service_role;
select public.run_country_completeness_recompute();

-- Migration-time invariants. Subjective backlogs are warnings and therefore do
-- not abort deployment; deterministic contradictions do.
do $checks$
begin
  if exists(select 1 from public.country_quality_profile where 'COUNTRY_EDITORIAL_REVIEW_LEAK'=any(blockers)) then
    raise exception 'country editorial review leakage remains';
  end if;
  if exists(select 1 from public.country_quality_profile where 'COUNTRY_REGION_CONTINENT_MISMATCH'=any(blockers)) then
    raise exception 'country region/continent mismatch remains';
  end if;
  if exists(select 1 from public.country_quality_profile where 'COUNTRY_LINK_MISMATCH'=any(blockers)) then
    raise exception 'country child relationship mismatch remains: %',(
      select jsonb_agg(to_jsonb(s)) from (
        select 'venue' kind,v.id,v.country_id entity_country,c.country_id city_country from public.venues v join public.cities c on c.id=v.city_id where v.country_id is distinct from c.country_id
        union all select 'event_city',e.id,e.country_id,c.country_id from public.events e join public.cities c on c.id=e.city_id where e.country_id is distinct from c.country_id
        union all select 'event_venue',e.id,e.country_id,v.country_id from public.events e join public.venues v on v.id=e.venue_id where e.country_id is distinct from v.country_id
        union all select 'personality',p.id,p.country_id,c.country_id from public.personalities p join public.cities c on c.id=p.city_id where p.country_id is distinct from c.country_id
        union all select 'hotel',h.id,h.country_id,c.country_id from public.hotels h join public.cities c on c.id=h.city_id where h.country_id is distinct from c.country_id
        union all select 'village',v.id,v.country_id,c.country_id from public.queer_villages v join public.cities c on c.id=v.city_id where v.country_id is distinct from c.country_id
        union all select 'organization',o.id,o.country_id,c.country_id from public.organizations o join public.cities c on c.id=o.city_id where o.country_id is distinct from c.country_id
      ) s);
  end if;
end
$checks$;

commit;
