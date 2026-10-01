-- Multidimensional city quality contract.
-- Presence/completeness remains useful, but publication readiness is derived
-- independently and fails closed on identity, subject, geo, imagery and
-- relationship defects.

create extension if not exists pgcrypto;

create table if not exists public.entity_category_evidence (
  entity_type text not null check (entity_type in ('venue', 'event')),
  entity_id uuid not null,
  source text not null,
  proposed_category text not null,
  confidence numeric(4,3) check (confidence between 0 and 1),
  source_ref text,
  observed_at timestamptz not null default now(),
  applied boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  primary key (entity_type, entity_id, source)
);

alter table public.entity_category_evidence enable row level security;
revoke all on public.entity_category_evidence from public, anon, authenticated;
grant select, insert, update, delete on public.entity_category_evidence to service_role;

-- Keep legacy city image columns as compatibility projections while making the
-- asset registry authoritative for validation, provenance and deduplication.
create or replace function public.tg_cities_sync_image_assets()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $function$
declare
  v_url text;
begin
  v_url := coalesce(nullif(btrim(new.curated_image_url), ''),
                    case when not coalesce(new.image_flagged, false)
                         then nullif(btrim(new.image_url), '') end);

  if tg_op = 'update'
     and new.curated_image_url is not distinct from old.curated_image_url
     and new.image_url is not distinct from old.image_url
     and new.image_flagged is not distinct from old.image_flagged then
    return new;
  end if;

  delete from public.image_asset_links
  where entity_type = 'city' and entity_id = new.id and role = 'cover';

  if v_url is not null then
    perform public._image_assets_upsert_link(
      'city', new.id, v_url, 'cover',
      case when nullif(btrim(new.curated_image_url), '') is not null
           then 'city_curated_compat' else 'city_direct_compat' end
    );
    update public.image_assets ia
    set source = coalesce(nullif(new.field_provenance->'image_url'->>'source', ''), ia.source),
        source_ref = coalesce(nullif(new.field_provenance->'image_url'->>'source_url', ''), ia.source_ref),
        license = coalesce(
          case
            when lower(btrim(coalesce(new.field_provenance->'image_url'->>'license', '')))
                 not in ('', 'unknown', 'unverified', 'none', 'n/a', 'unknown_pending_verification')
            then new.field_provenance->'image_url'->>'license'
          end,
          ia.license
        ),
        metadata = ia.metadata || jsonb_strip_nulls(jsonb_build_object(
          'source_identity', new.field_provenance->'image_url'->>'source_identity',
          'retrieved_at', new.field_provenance->'image_url'->>'retrieved_at',
          'source_hash', new.field_provenance->'image_url'->>'source_hash',
          'confidence', new.field_provenance->'image_url'->>'confidence'))
    from public.image_asset_links l
    where l.asset_id = ia.id and l.entity_type = 'city' and l.entity_id = new.id
      and l.role = 'cover';
  end if;
  return new;
end
$function$;

drop trigger if exists cities_sync_image_assets on public.cities;
create trigger cities_sync_image_assets
after insert or update of curated_image_url, image_url, image_flagged on public.cities
for each row execute function public.tg_cities_sync_image_assets();

revoke all on function public.tg_cities_sync_image_assets() from public, anon, authenticated;
grant execute on function public.tg_cities_sync_image_assets() to service_role;

do $backfill$
declare r record;
begin
  for r in
    select c.id,
           coalesce(nullif(btrim(c.curated_image_url), ''),
                    case when not coalesce(c.image_flagged, false)
                         then nullif(btrim(c.image_url), '') end) as image_url,
           nullif(btrim(c.curated_image_url), '') is not null as curated
    from public.cities c
    where c.duplicate_of_id is null
      and coalesce(nullif(btrim(c.curated_image_url), ''),
                   case when not coalesce(c.image_flagged, false)
                        then nullif(btrim(c.image_url), '') end) is not null
  loop
    delete from public.image_asset_links
    where entity_type = 'city' and entity_id = r.id and role = 'cover';
    perform public._image_assets_upsert_link(
      'city', r.id, r.image_url, 'cover',
      case when r.curated then 'city_curated_compat' else 'city_direct_compat' end
    );
  end loop;
end
$backfill$;

create or replace view public.city_quality_profile
with (security_invoker = true)
as
with base as materialized (
  select
    c.id, c.name, c.slug, c.country_id, c.shell_status, c.seo_indexable,
    c.wikidata_qid, c.wikipedia_title, c.latitude, c.longitude, c.timezone,
    c.description, c.description_i18n, c.editorial_hook, c.local_customs,
    c.best_time_to_visit, c.lgbt_friendly_rating, c.image_flagged,
    c.curated_image_url, c.image_url, c.field_provenance,
    c.last_verified_at, c.last_refreshed_at, c.updated_at,
    c.completeness_score, c.trust_score,
    coalesce(nullif(btrim(c.curated_image_url), ''),
             case when not coalesce(c.image_flagged, false)
                  then nullif(btrim(c.image_url), '') end) as selected_image_url,
    case
      when c.slug like 'tmp-%' or c.shell_status = 'placeholder' then 'unresolved_placeholder'
      when c.shell_status = 'ghost' then 'archived_non_place'
      when c.shell_status = 'merged' then 'merged_redirect'
      when c.seo_indexable then 'publishable_place'
      else 'internal_record'
    end as lifecycle_cohort,
    (select count(*)::integer from jsonb_object_keys(coalesce(c.description_i18n, '{}'::jsonb))) as translation_count
  from public.cities c
  where c.duplicate_of_id is null
),
image_url_usage as (
  select public.canonicalise_image_url(selected_image_url) as canonical_url,
         count(*)::integer as city_count,
         count(distinct country_id)::integer as country_count
  from base
  where selected_image_url is not null
  group by 1
),
description_usage as (
  select encode(extensions.digest(lower(regexp_replace(btrim(description), '[[:space:]]+', ' ', 'g')), 'sha256'), 'hex') as description_hash,
         count(*)::integer as city_count,
         count(distinct country_id)::integer as country_count
  from base
  where nullif(btrim(description), '') is not null
  group by 1
),
asset_facts as (
  select l.entity_id as city_id,
    bool_or(ia.status = 'active' and not ia.is_flagged
            and ia.format is not null and ia.format <> 'other'
            and ia.width >= 800 and ia.height >= 450
            and ia.phash is not null
            and nullif(btrim(ia.license), '') is not null
            and lower(ia.license) not in ('unknown', 'unknown_pending_verification')) as verified_image,
    bool_or(nullif(btrim(ia.source), '') is not null
            and nullif(btrim(ia.license), '') is not null) as image_has_provenance,
    bool_or(ia.is_flagged or ia.status in ('flagged', 'deleted')) as registry_flagged,
    bool_or(ia.status = 'active') as registry_active,
    max(ia.phash) filter (where ia.phash is not null) as phash
  from public.image_asset_links l
  join public.image_assets ia on ia.id = l.asset_id
  where l.entity_type = 'city' and l.role = 'cover'
  group by l.entity_id
),
phash_usage as (
  select af.phash, count(*)::integer as city_count,
         count(distinct b.country_id)::integer as country_count
  from asset_facts af join base b on b.id = af.city_id
  where af.phash is not null
  group by af.phash
),
venue_facts as (
  select c.id as city_id,
    count(v.id)::integer as venue_count,
    count(v.id) filter (where v.country_id is distinct from c.country_id)::integer as country_mismatch_count,
    count(v.id) filter (where coalesce(v.category, 'other') = 'other')::integer as other_count
  from base c left join public.venues v
    on v.city_id = c.id and v.duplicate_of_id is null and v.closed_at is null
  group by c.id
),
event_facts as (
  select c.id as city_id,
    count(e.id)::integer as event_count,
    count(e.id) filter (where e.country_id is distinct from c.country_id)::integer as country_mismatch_count,
    count(e.id) filter (where coalesce(e.event_type, 'other') = 'other')::integer as other_count
  from base c left join public.events e
    on e.city_id = c.id and e.duplicate_of_id is null
  group by c.id
),
category_evidence_facts as (
  select x.city_id,
    avg(x.confidence) filter (where x.confidence is not null) as average_confidence,
    count(*) filter (where x.disagrees)::integer as disagreement_count,
    count(*)::integer as evidence_count
  from (
    select v.city_id, e.confidence, e.proposed_category is distinct from v.category as disagrees
    from public.entity_category_evidence e
    join public.venues v on e.entity_type = 'venue' and v.id = e.entity_id
    where v.city_id is not null and v.duplicate_of_id is null
    union all
    select ev.city_id, e.confidence, e.proposed_category is distinct from ev.event_type as disagrees
    from public.entity_category_evidence e
    join public.events ev on e.entity_type = 'event' and ev.id = e.entity_id
    where ev.city_id is not null and ev.duplicate_of_id is null
  ) x
  group by x.city_id
),
legacy_venue_candidates as (
  select v.country_id,
         public.immutable_unaccent(lower(btrim(v.city))) as normalized_city,
         count(*)::integer as candidate_count
  from public.venues v
  where v.city_id is null and v.duplicate_of_id is null and v.closed_at is null
    and nullif(btrim(v.city), '') is not null
  group by v.country_id, public.immutable_unaccent(lower(btrim(v.city)))
),
legacy_event_candidates as (
  select e.country_id,
         public.immutable_unaccent(lower(btrim(e.city))) as normalized_city,
         count(*)::integer as candidate_count
  from public.events e
  where e.city_id is null and e.duplicate_of_id is null
    and nullif(btrim(e.city), '') is not null
  group by e.country_id, public.immutable_unaccent(lower(btrim(e.city)))
),
legacy_link_facts as (
  select c.id as city_id,
         coalesce(v.candidate_count, 0) as unlinked_venue_candidates,
         coalesce(e.candidate_count, 0) as unlinked_event_candidates
  from base c
  left join legacy_venue_candidates v
    on v.country_id = c.country_id
   and v.normalized_city = public.immutable_unaccent(lower(btrim(c.name)))
  left join legacy_event_candidates e
    on e.country_id = c.country_id
   and e.normalized_city = public.immutable_unaccent(lower(btrim(c.name)))
),
namesake_facts as (
  select c.id as city_id,
    count(distinct e.id) filter (where alternate.id is not null)::integer as wrong_namesake_events
  from base c
  left join public.events e on e.city_id = c.id and e.duplicate_of_id is null
    and e.status = 'active' and coalesce(e.end_date, e.start_date) >= now()
    and e.country_id is distinct from c.country_id
  left join base alternate
    on alternate.id <> c.id and alternate.country_id = e.country_id
   and public.immutable_unaccent(lower(btrim(alternate.name)))
       = public.immutable_unaccent(lower(btrim(e.city)))
  group by c.id
),
country_contradictions as (
  select c.id as city_id,
         count(*) filter (where e.country is not null and length(e.country) = 2
                           and upper(e.country) <> upper(co.code))::integer as contradicting
  from base c
  join public.countries co on co.id = c.country_id
  join public.events e on e.city_id = c.id and e.duplicate_of_id is null
  where e.country is not null and length(e.country) = 2
  group by c.id
  having count(*) = count(*) filter (
    where upper(e.country) <> upper(co.code))
),
duplicate_reviews as (
  select r.entity_id as city_id,
    count(*) filter (where r.review_type in ('dedup', 'duplicate_candidate', 'city_duplicate'))::integer as pending_count,
    count(*) filter (where r.review_type = 'CITY_IMAGE_AMBIGUOUS')::integer as pending_image_count
  from public.review_queue r
  where r.entity_type = 'city' and r.status = 'pending'
  group by r.entity_id
),
facts as materialized (
  select b.*,
    iu.city_count as duplicate_image_count,
    iu.country_count as duplicate_image_country_count,
    du.city_count as duplicate_description_count,
    du.country_count as duplicate_description_country_count,
    coalesce(af.verified_image, false) as verified_image,
    coalesce(af.image_has_provenance, false) as image_has_provenance,
    coalesce(af.registry_flagged, false) as registry_flagged,
    coalesce(af.registry_active, false) as registry_active,
    coalesce(pu.city_count, 0) as duplicate_phash_count,
    coalesce(pu.country_count, 0) as duplicate_phash_country_count,
    vf.venue_count, ef.event_count,
    vf.country_mismatch_count + ef.country_mismatch_count as relationship_country_mismatches,
    vf.other_count + ef.other_count as category_other_count,
    vf.venue_count + ef.event_count as categorized_entity_count,
    cef.average_confidence as category_average_confidence,
    coalesce(cef.disagreement_count, 0) as category_disagreement_count,
    coalesce(cef.evidence_count, 0) as category_evidence_count,
    lf.unlinked_venue_candidates, lf.unlinked_event_candidates,
    nf.wrong_namesake_events,
    coalesce(cc.contradicting, 0) as wrong_country_evidence,
    coalesce(dr.pending_count, 0) as pending_duplicate_reviews,
    coalesce(dr.pending_image_count, 0) as pending_image_reviews,
    encode(extensions.digest(coalesce(b.description, ''), 'sha256'), 'hex') as current_description_hash
  from base b
  left join image_url_usage iu
    on iu.canonical_url = public.canonicalise_image_url(b.selected_image_url)
  left join description_usage du
    on du.description_hash = encode(extensions.digest(lower(regexp_replace(btrim(b.description), '[[:space:]]+', ' ', 'g')), 'sha256'), 'hex')
  left join asset_facts af on af.city_id = b.id
  left join phash_usage pu on pu.phash = af.phash
  join venue_facts vf on vf.city_id = b.id
  join event_facts ef on ef.city_id = b.id
  left join category_evidence_facts cef on cef.city_id = b.id
  join legacy_link_facts lf on lf.city_id = b.id
  join namesake_facts nf on nf.city_id = b.id
  left join country_contradictions cc on cc.city_id = b.id
  left join duplicate_reviews dr on dr.city_id = b.id
),
assessed as (
  select f.*,
    array_remove(array[
      case when f.seo_indexable and nullif(btrim(f.wikidata_qid), '') is null
                              and nullif(btrim(f.wikipedia_title), '') is null
           then 'CITY_IDENTITY_AMBIGUOUS' end,
      case when f.seo_indexable and (f.latitude is null or f.longitude is null
             or f.latitude not between -90 and 90 or f.longitude not between -180 and 180
             or (f.latitude = 0 and f.longitude = 0)) then 'CITY_GEO_INVALID' end,
      case when f.seo_indexable and (f.name like '%�%' or f.description like '%�%')
           then 'CITY_TEXT_MOJIBAKE' end,
      case when f.seo_indexable and nullif(btrim(f.description), '') is not null and (
             f.description ~* '(^|[[:space:]])(may refer to|refers to multiple|disambiguation)([[:space:]]|$)'
             or f.description ~* '(as an ai|i cannot provide|provided sources do not contain|sources do not provide)')
           then 'CITY_DESCRIPTION_WRONG_SUBJECT' end,
      case when f.seo_indexable and coalesce(f.duplicate_description_count, 0) > 1
             and coalesce(f.duplicate_description_country_count, 0) > 1
           then 'CITY_DESCRIPTION_REUSED' end,
      case when f.seo_indexable and (coalesce(f.image_flagged, false) or f.registry_flagged)
           and nullif(btrim(f.curated_image_url), '') is null then 'CITY_IMAGE_FLAGGED' end,
      case when f.seo_indexable and f.selected_image_url is not null
             and ((coalesce(f.duplicate_image_count, 0) > 1 and coalesce(f.duplicate_image_country_count, 0) > 1)
               or (f.duplicate_phash_count > 1 and f.duplicate_phash_country_count > 1))
           then 'CITY_IMAGE_REUSED' end,
      case when f.seo_indexable and f.wrong_namesake_events > 0 then 'CITY_LINK_NAMESAKE' end,
      case when f.seo_indexable and (f.relationship_country_mismatches > 0 or f.wrong_country_evidence >= 3)
           then 'CITY_LINK_COUNTRY_MISMATCH' end,
      case when f.seo_indexable and f.pending_duplicate_reviews > 0 then 'CITY_DUPLICATE_UNRESOLVED' end,
      case when f.lifecycle_cohort = 'archived_non_place' and f.seo_indexable then 'CITY_GHOST_EXPOSED' end,
      case when f.lifecycle_cohort = 'archived_non_place' and f.venue_count + f.event_count > 0
           then 'CITY_GHOST_HAS_LIVE_CHILDREN' end,
      case when f.lifecycle_cohort = 'unresolved_placeholder' and f.seo_indexable
           then 'CITY_PLACEHOLDER_EXPOSED' end
    ], null)::text[] as blockers,
    array_remove(array[
      case when f.lifecycle_cohort = 'unresolved_placeholder' then 'CITY_LIFECYCLE_UNRESOLVED' end,
      case when f.seo_indexable and nullif(btrim(f.description), '') is null then 'CITY_DESCRIPTION_MISSING' end,
      case when f.seo_indexable and f.selected_image_url is null then 'CITY_IMAGE_MISSING' end,
      case when f.seo_indexable and f.selected_image_url is not null and not f.verified_image
           then 'CITY_IMAGE_UNVERIFIED' end,
      case when f.pending_image_reviews > 0 then 'CITY_IMAGE_AMBIGUOUS' end,
      case when f.seo_indexable and nullif(btrim(f.description), '') is not null and not (
        coalesce(f.field_provenance->'description'->>'source_url', '') <> '' and
        coalesce(f.field_provenance->'description'->>'source_identity', '') <> '' and
        coalesce(f.field_provenance->'description'->>'retrieved_at', '') <> '' and
        coalesce(f.field_provenance->'description'->>'source_hash', '') <> '' and
        coalesce(f.field_provenance->'description'->>'language', '') <> '' and
        coalesce(f.field_provenance->'description'->>'confidence', '') <> '')
        then 'CITY_DESCRIPTION_PROVENANCE_MISSING' end,
      case when f.unlinked_venue_candidates + f.unlinked_event_candidates > 0 then 'CITY_LINK_UNRESOLVED' end,
      case when f.categorized_entity_count > 0
             and f.category_other_count::numeric / f.categorized_entity_count > 0.20
           then 'CITY_CATEGORY_UNCLASSIFIED' end,
      case when f.category_disagreement_count > 0 then 'CITY_CATEGORY_DISAGREEMENT' end,
      case when f.seo_indexable and f.description_i18n <> '{}'::jsonb
             and coalesce(f.field_provenance->'description'->>'source_hash', '') <> f.current_description_hash
           then 'CITY_TRANSLATION_STALE' end,
      case when coalesce(f.last_verified_at, f.last_refreshed_at, f.updated_at) < now() - interval '180 days'
           then 'CITY_FRESHNESS_STALE' end
    ], null)::text[] as warnings
  from facts f
)
select
  a.id, a.name, a.slug, a.country_id, a.shell_status, a.lifecycle_cohort,
  a.seo_indexable,
  (a.seo_indexable and a.lifecycle_cohort = 'publishable_place'
   and cardinality(a.blockers) = 0) as publication_ready,
  a.blockers, a.warnings, a.blockers || a.warnings as issue_codes,
  case when a.lifecycle_cohort in ('publishable_place', 'internal_record', 'archived_non_place', 'merged_redirect')
       then 100 else 0 end::smallint as lifecycle_score,
  ((case when nullif(btrim(a.wikidata_qid), '') is not null then 50 else 0 end) +
   (case when nullif(btrim(a.wikipedia_title), '') is not null then 50 else 0 end))::smallint as identity_score,
  ((case when a.latitude between -90 and 90 and a.longitude between -180 and 180
              and not (a.latitude = 0 and a.longitude = 0) then 70 else 0 end) +
   (case when nullif(btrim(a.timezone), '') is not null then 30 else 0 end))::smallint as geo_score,
  (case when nullif(btrim(a.description), '') is null then 0
        when 'CITY_DESCRIPTION_WRONG_SUBJECT' = any(a.blockers)
          or 'CITY_DESCRIPTION_REUSED' = any(a.blockers) then 0
        when length(btrim(a.description)) >= 200 then 100
        when length(btrim(a.description)) >= 80 then 70 else 40 end)::smallint as content_score,
  ((case when nullif(btrim(a.editorial_hook), '') is not null then 40 else 0 end) +
   (case when nullif(btrim(a.local_customs), '') is not null then 30 else 0 end) +
   (case when nullif(btrim(a.best_time_to_visit), '') is not null then 20 else 0 end) +
   (case when a.lgbt_friendly_rating is not null then 10 else 0 end))::smallint as editorial_score,
  (case when a.verified_image and not ('CITY_IMAGE_REUSED' = any(a.blockers)) then 100
        when a.selected_image_url is not null and not coalesce(a.image_flagged, false)
             and not a.registry_flagged and not ('CITY_IMAGE_REUSED' = any(a.blockers)) then 40
        else 0 end)::smallint as imagery_score,
  greatest(0, 100 - least(50, a.relationship_country_mismatches * 25)
                    - least(30, a.wrong_namesake_events * 10)
                    - least(20, a.unlinked_venue_candidates + a.unlinked_event_candidates))::smallint as relationships_score,
  (case when a.categorized_entity_count = 0 then 100 else greatest(0, round(
     70 * (1 - a.category_other_count::numeric / a.categorized_entity_count)
     + 30 * coalesce(a.category_average_confidence, 0)
     - least(30, a.category_disagreement_count * 10))) end)::smallint as taxonomy_score,
  ((case when nullif(btrim(a.description), '') is null then 50
         when coalesce(a.field_provenance->'description'->>'source_url', '') <> ''
          and coalesce(a.field_provenance->'description'->>'source_identity', '') <> ''
          and coalesce(a.field_provenance->'description'->>'source_hash', '') <> '' then 50 else 0 end) +
   (case when a.selected_image_url is null then 50 when a.image_has_provenance then 50 else 0 end))::smallint as provenance_score,
  (case when coalesce(a.last_verified_at, a.last_refreshed_at, a.updated_at) >= now() - interval '90 days' then 100
        when coalesce(a.last_verified_at, a.last_refreshed_at, a.updated_at) >= now() - interval '180 days' then 60
        else 20 end)::smallint as freshness_score,
  (case when nullif(btrim(a.description), '') is null then 100
        else least(100, a.translation_count * 25) end)::smallint as translation_score,
  a.venue_count, a.event_count, a.unlinked_venue_candidates, a.unlinked_event_candidates,
  a.relationship_country_mismatches, a.wrong_namesake_events,
  a.category_other_count, a.categorized_entity_count,
  a.category_average_confidence, a.category_disagreement_count, a.category_evidence_count,
  a.selected_image_url, a.verified_image, a.image_has_provenance,
  coalesce(a.duplicate_image_count, 0) as duplicate_image_count,
  a.duplicate_phash_count, a.translation_count,
  a.completeness_score, a.trust_score, a.updated_at, a.last_verified_at
from assessed a;

comment on view public.city_quality_profile is
  'One row per canonical city with lifecycle, ten independent quality dimensions, hard publication blockers and stable issue codes.';

revoke all on public.city_quality_profile from public, anon;
grant select on public.city_quality_profile to authenticated, service_role;

create table if not exists public.city_quality_snapshots (
  snapshot_date date primary key default current_date,
  captured_at timestamptz not null default now(),
  scorecard jsonb not null,
  constraint city_quality_snapshots_probe_ok check (scorecard->>'probe_ok' = 'true')
);

alter table public.city_quality_snapshots enable row level security;
revoke all on public.city_quality_snapshots from public, anon, authenticated;
grant select, insert, update on public.city_quality_snapshots to service_role;

create or replace function public._city_quality_scorecard()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  with q as materialized (select * from public.city_quality_profile),
  issues as (
    select code, count(*)::integer as affected
    from q cross join lateral unnest(q.issue_codes) code
    group by code
  ),
  dimension_bands as (
    select d.dimension,
      jsonb_build_object(
        'critical_0_39', count(*) filter (where d.score < 40),
        'needs_work_40_69', count(*) filter (where d.score between 40 and 69),
        'strong_70_100', count(*) filter (where d.score >= 70)
      ) as distribution
    from q
    cross join lateral (values
      ('lifecycle', q.lifecycle_score), ('identity', q.identity_score),
      ('geo', q.geo_score), ('content', q.content_score),
      ('editorial', q.editorial_score), ('imagery', q.imagery_score),
      ('relationships', q.relationships_score), ('taxonomy', q.taxonomy_score),
      ('provenance', q.provenance_score), ('freshness', q.freshness_score),
      ('translation', q.translation_score)
    ) d(dimension, score)
    where q.seo_indexable or d.dimension = 'lifecycle'
    group by d.dimension
  ),
  lifecycle as (
    select cohort, count(*)::integer as total from (
      select case
        when duplicate_of_id is not null or shell_status = 'merged' then 'merged_redirect'
        when slug like 'tmp-%' or shell_status = 'placeholder' then 'unresolved_placeholder'
        when shell_status = 'ghost' then 'archived_non_place'
        when seo_indexable then 'publishable_place'
        else 'internal_record' end as cohort
      from public.cities
    ) x group by cohort
  )
  select jsonb_build_object(
    'probe_ok', true,
    'generated_at', now(),
    'totals', jsonb_build_object(
      'rows', (select count(*) from public.cities),
      'canonical', (select count(*) from q),
      'indexable', (select count(*) from q where seo_indexable),
      'publication_ready', (select count(*) from q where publication_ready),
      'publication_blocked', (select count(*) from q where seo_indexable and not publication_ready)
    ),
    'lifecycle', coalesce((select jsonb_object_agg(cohort, total) from lifecycle), '{}'::jsonb),
    'dimensions', jsonb_build_object(
      'lifecycle', (select round(avg(lifecycle_score), 1) from q),
      'identity', (select round(avg(identity_score), 1) from q where seo_indexable),
      'geo', (select round(avg(geo_score), 1) from q where seo_indexable),
      'content', (select round(avg(content_score), 1) from q where seo_indexable),
      'editorial', (select round(avg(editorial_score), 1) from q where seo_indexable),
      'imagery', (select round(avg(imagery_score), 1) from q where seo_indexable),
      'relationships', (select round(avg(relationships_score), 1) from q where seo_indexable),
      'taxonomy', (select round(avg(taxonomy_score), 1) from q where seo_indexable),
      'provenance', (select round(avg(provenance_score), 1) from q where seo_indexable),
      'freshness', (select round(avg(freshness_score), 1) from q where seo_indexable),
      'translation', (select round(avg(translation_score), 1) from q where seo_indexable)
    ),
    'dimension_distributions', coalesce((
      select jsonb_object_agg(dimension, distribution order by dimension) from dimension_bands
    ), '{}'::jsonb),
    'issues', coalesce((select jsonb_object_agg(code, affected order by code) from issues), '{}'::jsonb),
    'operations', jsonb_build_object(
      'unlinked_venues', (select count(*) from public.venues where duplicate_of_id is null and city_id is null),
      'unlinked_events', (select count(*) from public.events where duplicate_of_id is null and city_id is null),
      'other_venues', (select count(*) from public.venues where duplicate_of_id is null and coalesce(category, 'other') = 'other'),
      'other_events', (select count(*) from public.events where duplicate_of_id is null and coalesce(event_type, 'other') = 'other'),
      'ghosts_with_live_children', (select count(*) from q
        where lifecycle_cohort = 'archived_non_place' and venue_count + event_count > 0),
      'merged_rows_with_live_children', (select count(*) from public.cities c
        where c.duplicate_of_id is not null and (
          exists (select 1 from public.venues v where v.city_id = c.id and v.duplicate_of_id is null)
          or exists (select 1 from public.events e where e.city_id = c.id and e.duplicate_of_id is null))),
      'image_automation_backlog', (select count(*) from public.cities c
        where c.duplicate_of_id is null and c.seo_indexable
          and c.shell_status not in ('ghost', 'merged', 'placeholder')
          and ((c.image_url is null and c.curated_image_url is null) or c.image_flagged)),
      'image_automation_no_progress', (
        (select count(*) from (
          select r.items_changed from public.admin_automation_runs r
          where r.automation_slug = 'backfill-cities-images' and r.finished_at is not null
          order by r.started_at desc limit 3
        ) recent) = 3
        and not exists (
          select 1 from (
            select r.items_changed from public.admin_automation_runs r
            where r.automation_slug = 'backfill-cities-images' and r.finished_at is not null
            order by r.started_at desc limit 3
          ) recent where recent.items_changed > 0)
        and exists (select 1 from public.cities c
          where c.duplicate_of_id is null and c.seo_indexable
            and ((c.image_url is null and c.curated_image_url is null) or c.image_flagged))
      ),
      'verified_city_images', (select count(*) from q where verified_image),
      'descriptions_with_provenance', (select count(*) from q
        where content_score > 0 and 'CITY_DESCRIPTION_PROVENANCE_MISSING' <> all(warnings)),
      'oldest_unresolved_issue', (select min(created_at) from public.review_queue
        where entity_type = 'city' and status = 'pending' and left(review_type, 5) = 'CITY_')
    ),
    'samples', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'slug', slug, 'blockers', blockers))
      from (select id, name, slug, blockers from q where cardinality(blockers) > 0 order by cardinality(blockers) desc, name limit 20) s
    ), '[]'::jsonb),
    'automation', coalesce((
      select jsonb_build_object('last_run_at', last_run_at, 'last_run_status', last_run_status,
                                'fresh', last_run_at >= now() - interval '2 days')
      from public.admin_automations where slug = 'city_quality_issue_sync'
    ), jsonb_build_object('last_run_at', null, 'last_run_status', 'missing', 'fresh', false)),
    'trends', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', snapshot_date,
        'publication_blocked', scorecard#>'{totals,publication_blocked}',
        'publication_ready', scorecard#>'{totals,publication_ready}'))
      from (select * from public.city_quality_snapshots order by snapshot_date desc limit 12) t
    ), '[]'::jsonb)
  );
$function$;

revoke all on function public._city_quality_scorecard() from public, anon, authenticated;
grant execute on function public._city_quality_scorecard() to service_role;

-- Keep the RLS-bypassing aggregation private. The exposed wrapper runs with
-- the caller's role and admits only staff, CI's service role, and the postgres
-- owner used by SQL fixtures.
create or replace function public.city_quality_scorecard()
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $function$
begin
  if current_user not in ('postgres', 'service_role')
     and not public.has_any_role_jwt(array['admin'::app_role, 'moderator'::app_role]) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  return public._city_quality_scorecard();
end
$function$;

revoke all on function public.city_quality_scorecard() from public, anon;
grant execute on function public.city_quality_scorecard() to authenticated, service_role;

create unique index if not exists uq_review_queue_city_quality_pending
on public.review_queue (entity_type, entity_id, review_type)
where entity_type = 'city' and status = 'pending' and left(review_type, 5) = 'CITY_';

create unique index if not exists uq_review_queue_city_category_entity_pending
on public.review_queue (entity_type, entity_id, review_type)
where entity_type in ('venue', 'event') and status = 'pending'
  and review_type = 'CITY_CATEGORY_UNCLASSIFIED';

create or replace function public.run_city_category_review_sync(p_limit integer default 1000)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_queued integer := 0;
  v_resolved integer := 0;
begin
  with candidates as (
    select 'venue'::text as entity_type, v.id as entity_id, v.city_id,
           v.name as title, v.category as current_category,
           coalesce(v.is_featured, false) as high_impact, v.created_at as priority_at
    from public.venues v
    where v.duplicate_of_id is null and v.closed_at is null and v.city_id is not null
      and v.seo_indexable and coalesce(v.category, 'other') = 'other'
    union all
    select 'event', e.id, e.city_id, e.title, e.event_type,
           coalesce(e.is_featured, false), e.start_date
    from public.events e
    where e.duplicate_of_id is null and e.city_id is not null and e.is_public
      and coalesce(e.event_type, 'other') = 'other'
      and coalesce(e.end_date, e.start_date) >= now()
  ), prioritized as (
    select * from candidates order by high_impact desc, priority_at desc
    limit greatest(coalesce(p_limit, 1000), 1)
  )
  insert into public.review_queue(entity_type, entity_id, review_type, status, details)
  select p.entity_type, p.entity_id, 'CITY_CATEGORY_UNCLASSIFIED', 'pending',
    jsonb_build_object(
      'city_id', p.city_id, 'title', p.title, 'current_category', p.current_category,
      'high_impact', p.high_impact, 'source', 'city_category_quality',
      'evidence', coalesce((
        select jsonb_agg(jsonb_build_object(
          'source', e.source, 'proposed_category', e.proposed_category,
          'confidence', e.confidence, 'source_ref', e.source_ref,
          'observed_at', e.observed_at) order by e.confidence desc nulls last)
        from public.entity_category_evidence e
        where e.entity_type = p.entity_type and e.entity_id = p.entity_id
      ), '[]'::jsonb))
  from prioritized p
  on conflict (entity_type, entity_id, review_type)
    where entity_type in ('venue', 'event') and status = 'pending'
      and review_type = 'CITY_CATEGORY_UNCLASSIFIED'
  do update set details = excluded.details;
  get diagnostics v_queued = row_count;

  update public.review_queue r
  set status = 'resolved', resolved_at = now(),
      details = coalesce(r.details, '{}'::jsonb) || jsonb_build_object(
        'resolution', 'category_no_longer_unclassified', 'resolved_automatically', true)
  where r.status = 'pending' and r.review_type = 'CITY_CATEGORY_UNCLASSIFIED'
    and r.entity_type in ('venue', 'event')
    and ((r.entity_type = 'venue' and not exists (
           select 1 from public.venues v where v.id = r.entity_id
             and v.duplicate_of_id is null and v.closed_at is null
             and coalesce(v.category, 'other') = 'other'))
      or (r.entity_type = 'event' and not exists (
           select 1 from public.events e where e.id = r.entity_id
             and e.duplicate_of_id is null and coalesce(e.event_type, 'other') = 'other'
             and coalesce(e.end_date, e.start_date) >= now())));
  get diagnostics v_resolved = row_count;

  return jsonb_build_object('queued_or_refreshed', v_queued, 'resolved', v_resolved);
end
$function$;

revoke all on function public.run_city_category_review_sync(integer) from public, anon, authenticated;
grant execute on function public.run_city_category_review_sync(integer) to service_role;

create or replace function public.run_city_quality_issue_sync(p_limit integer default 1000)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_automation_id uuid;
  v_run_id bigint;
  v_started timestamptz := now();
  v_inserted integer := 0;
  v_resolved integer := 0;
  v_scorecard jsonb;
begin
  perform public.run_city_category_review_sync(p_limit);
  select id into v_automation_id from public.admin_automations where slug = 'city_quality_issue_sync';
  insert into public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  values (v_automation_id, 'city_quality_issue_sync', v_started, 'success', 0, 0)
  returning id into v_run_id;

  with actionable as (
    select q.id, q.name, q.slug, code, q.publication_ready,
           code = any(q.blockers) as hard_blocker
    from public.city_quality_profile q
    cross join lateral unnest(q.issue_codes) code
    where code in (
      'CITY_IDENTITY_AMBIGUOUS', 'CITY_DESCRIPTION_WRONG_SUBJECT',
      'CITY_DESCRIPTION_REUSED', 'CITY_IMAGE_REUSED', 'CITY_IMAGE_FLAGGED',
      'CITY_IMAGE_AMBIGUOUS',
      'CITY_LINK_NAMESAKE', 'CITY_LINK_COUNTRY_MISMATCH',
      'CITY_DUPLICATE_UNRESOLVED', 'CITY_CATEGORY_UNCLASSIFIED',
      'CITY_LINK_UNRESOLVED', 'CITY_LIFECYCLE_UNRESOLVED',
      'CITY_GHOST_EXPOSED', 'CITY_GHOST_HAS_LIVE_CHILDREN', 'CITY_PLACEHOLDER_EXPOSED',
      'CITY_DESCRIPTION_PROVENANCE_MISSING', 'CITY_TRANSLATION_STALE'
    )
    order by (code = any(q.blockers)) desc, q.seo_indexable desc, q.name
    limit greatest(coalesce(p_limit, 1000), 1)
  )
  insert into public.review_queue(entity_type, entity_id, review_type, status, details)
  select 'city', a.id, a.code, 'pending', jsonb_build_object(
    'city_name', a.name, 'city_slug', a.slug, 'hard_blocker', a.hard_blocker,
    'publication_ready', a.publication_ready, 'source', 'city_quality_profile',
    'observed_at', now())
  from actionable a
  on conflict (entity_type, entity_id, review_type)
    where entity_type = 'city' and status = 'pending' and left(review_type, 5) = 'CITY_'
  do update set details = excluded.details;
  get diagnostics v_inserted = row_count;

  update public.review_queue r
  set status = 'resolved', resolved_at = now(),
      details = coalesce(r.details, '{}'::jsonb) || jsonb_build_object(
        'resolution', 'quality_signal_cleared', 'resolved_automatically', true)
  where r.entity_type = 'city' and r.status = 'pending' and left(r.review_type, 5) = 'CITY_'
    and not exists (
      select 1 from public.city_quality_profile q
      where q.id = r.entity_id and r.review_type = any(q.issue_codes)
    );
  get diagnostics v_resolved = row_count;

  v_scorecard := public._city_quality_scorecard();
  insert into public.city_quality_snapshots(snapshot_date, captured_at, scorecard)
  values (current_date, now(), v_scorecard)
  on conflict (snapshot_date) do update
    set captured_at = excluded.captured_at, scorecard = excluded.scorecard;

  update public.admin_automation_runs
  set finished_at = now(), items_examined = (v_scorecard#>>'{totals,canonical}')::integer,
      items_changed = v_inserted + v_resolved,
      summary = jsonb_build_object('queued_or_refreshed', v_inserted, 'resolved', v_resolved,
                                   'probe_ok', true)
  where id = v_run_id;
  update public.admin_automations
  set last_run_at = v_started, last_run_status = 'success' where id = v_automation_id;

  return jsonb_build_object('probe_ok', true, 'queued_or_refreshed', v_inserted,
                            'resolved', v_resolved, 'scorecard', v_scorecard);
exception when others then
  if v_run_id is not null then
    update public.admin_automation_runs set finished_at = now(), status = 'error', error = sqlerrm
    where id = v_run_id;
  end if;
  if v_automation_id is not null then
    update public.admin_automations set last_run_at = v_started, last_run_status = 'error'
    where id = v_automation_id;
  end if;
  raise;
end
$function$;

revoke all on function public.run_city_quality_issue_sync(integer) from public, anon, authenticated;
grant execute on function public.run_city_quality_issue_sync(integer) to service_role;

insert into public.admin_automations
  (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
values (
  'city_quality_issue_sync', 'Synchronize city quality issues',
  'Refreshes multidimensional city issue cohorts, unified review items, snapshots and automation freshness.',
  'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
  '{"type":"rpc","fn":"run_city_quality_issue_sync"}'::jsonb, '20 4 * * *'
)
on conflict (slug) do update set
  description = excluded.description, enabled = true, trigger = excluded.trigger,
  action = excluded.action, schedule = excluded.schedule, updated_at = now();

-- Presence coverage no longer rewards flagged, unverified or widely reused images.
create or replace function public.compute_city_completeness(p_id uuid)
returns smallint
language plpgsql
stable security definer
set search_path = public
as $function$
declare
  c public.cities%rowtype;
  v_villages integer := 0;
  v_queer numeric := 0;
  v_description numeric := 0;
  v_travel numeric := 0;
  v_geo numeric := 0;
  v_image numeric := 0;
  v_basics numeric := 0;
  v_trivia numeric := 0;
  v_desc_len integer := 0;
  v_image_valid boolean := false;
begin
  select * into c from public.cities where id = p_id;
  if not found then return 0; end if;

  select count(*) into v_villages from public.queer_villages q where q.city_id = p_id;
  v_queer :=
      (case when c.lgbt_friendly_rating is not null then 0.4 else 0 end)
    + (case when v_villages > 0 then 0.4 else 0 end)
    + (case when c.local_customs is not null and c.local_customs ~* '(lgbt|lgbtq|queer|gay|trans|safe|safety|pride)' then 0.2 else 0 end);
  v_desc_len := coalesce(length(trim(c.description)), 0);
  v_description := case when v_desc_len >= 200 then 1.0 when v_desc_len >= 80 then 0.7 when v_desc_len >= 40 then 0.4 else 0 end;
  v_travel := (case when c.best_time_to_visit is not null then 0.5 else 0 end)
            + (case when c.climate_type is not null then 0.25 else 0 end)
            + (case when c.major_airport_code is not null then 0.25 else 0 end);
  v_geo := (case when c.latitude between -90 and 90 and c.longitude between -180 and 180
                       and not (c.latitude = 0 and c.longitude = 0) then 0.7 else 0 end)
         + (case when c.timezone is not null then 0.3 else 0 end);

  select exists (
    select 1
    from public.image_asset_links l join public.image_assets ia on ia.id = l.asset_id
    where l.entity_type = 'city' and l.entity_id = p_id and l.role = 'cover'
      and ia.status = 'active' and not ia.is_flagged and ia.format is not null and ia.format <> 'other'
      and ia.width >= 800 and ia.height >= 450
      and ia.phash is not null
      and nullif(btrim(ia.license), '') is not null
      and lower(ia.license) not in ('unknown', 'unknown_pending_verification')
      and not exists (
        select 1 from public.image_asset_links l2
        join public.cities c2 on c2.id = l2.entity_id
        where l2.entity_type = 'city' and l2.role = 'cover' and l2.asset_id = ia.id
          and c2.duplicate_of_id is null and c2.id <> p_id
      )
  ) into v_image_valid;
  v_image := case when v_image_valid then 1.0 else 0 end;

  v_basics := (case when c.population is not null then 0.4 else 0 end)
            + (case when c.region_name is not null then 0.3 else 0 end)
            + (case when c.country_id is not null then 0.3 else 0 end);
  v_trivia := (case when c.mayor is not null then 0.25 else 0 end)
            + (case when c.founded_year is not null then 0.25 else 0 end)
            + (case when c.sister_cities is not null and array_length(c.sister_cities, 1) > 0 then 0.25 else 0 end)
            + (case when c.postal_codes is not null and array_length(c.postal_codes, 1) > 0 then 0.25 else 0 end);

  return round(100 * least(1.0, greatest(0.0,
    0.30*v_queer + 0.20*v_description + 0.15*v_travel + 0.15*v_geo +
    0.10*v_image + 0.07*v_basics + 0.03*v_trivia)))::smallint;
end
$function$;

alter function public.compute_city_completeness(uuid) owner to postgres;
revoke all on function public.compute_city_completeness(uuid) from public, anon, authenticated;
grant execute on function public.compute_city_completeness(uuid) to service_role;

select public.sync_automations_to_cron(true);

-- Replace the legacy anon-callable image cron with a Vault-backed internal
-- invocation. The Edge Function has verify_jwt=false so pg_cron can reach it,
-- but requireInternalOrAdmin rejects every request without this secret or an
-- authenticated admin/service-role token.
do $cron$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'backfill-cities-images';
  perform cron.schedule(
    'backfill-cities-images',
    '45 4 * * *',
    $job$
      select net.http_post(
        url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/backfill-cities-images',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'X-Internal-Secret', (
            select decrypted_secret from vault.decrypted_secrets
            where name = 'internal_invoke_secret'
          )
        ),
        body := '{"batch_size":50}'::jsonb,
        timeout_milliseconds := 120000
      );
    $job$
  );
end
$cron$;

-- Register the exact live command after the general sync and secure rewrite.
-- The Edge Function records every run and its progress in this registry.
insert into public.admin_automations
  (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
select
  'backfill-cities-images', 'Verify and backfill city images',
  'Ranks multiple geographically grounded candidates, validates assets, retries flagged cities and queues ambiguity.',
  'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
  jsonb_build_object('type', 'cron', 'jobname', j.jobname, 'command', j.command),
  j.schedule
from cron.job j where j.jobname = 'backfill-cities-images'
on conflict (slug) do update set
  description = excluded.description, enabled = true, trigger = excluded.trigger,
  action = excluded.action, schedule = excluded.schedule, updated_at = now();
