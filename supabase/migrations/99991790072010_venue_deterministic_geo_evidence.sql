-- Resolve a second, deliberately narrow geo cohort:
--   1. venue.city matches exactly one canonical live city worldwide; or
--   2. a source address ends with exactly one canonical country name.
-- Ambiguous names, unsafe coordinates, and free-form inference are excluded.

create temporary table venue_unique_city_geo_candidates on commit drop as
with blocked as (
  select v.id, v.city
  from public.venues v
  join public.venue_quality_snapshots q on q.venue_id = v.id
  where v.duplicate_of_id is null
    and v.closed_at is null
    and v.review_status is distinct from 'archived'
    and v.country_id is null
    and nullif(btrim(v.city), '') is not null
    and q.blocker_codes @> array['missing_country']::text[]
), matched as (
  select
    b.id as venue_id,
    c.id as city_id,
    c.country_id,
    co.code as country_code,
    count(*) over (partition by b.id) as match_count
  from blocked b
  join public.cities c
    on c.duplicate_of_id is null
   and public.normalize_name(c.name)
       = public.normalize_name(regexp_replace(b.city, '^\*', ''))
  join public.countries co on co.id = c.country_id
)
select
  m.venue_id,
  m.city_id,
  m.country_id,
  m.country_code,
  'derived:unique_city_exact'::text as evidence_source,
  0.95::numeric(3,2) as confidence,
  coalesce((
    select max(s.last_seen_at)
    from public.venue_sources s
    where s.venue_id = m.venue_id
  ), now()) as observed_at,
  'unique_city_exact'::text as evidence_kind
from matched m
where m.match_count = 1;

create temporary table venue_address_country_geo_candidates on commit drop as
with blocked as (
  select v.id
  from public.venues v
  join public.venue_quality_snapshots q on q.venue_id = v.id
  where v.duplicate_of_id is null
    and v.closed_at is null
    and v.review_status is distinct from 'archived'
    and v.country_id is null
    and q.blocker_codes @> array['missing_country']::text[]
    and not exists (
      select 1 from venue_unique_city_geo_candidates c where c.venue_id = v.id
    )
), addresses as (
  select
    b.id as venue_id,
    s.source_slug,
    s.is_primary,
    s.confidence,
    s.last_seen_at,
    nullif(btrim(s.payload #>> '{normalized,location,address}'), '') as address
  from blocked b
  join public.venue_sources s on s.venue_id = b.id
), matched as (
  select
    a.*,
    c.id as country_id,
    c.code as country_code
  from addresses a
  join public.countries c
    on a.address is not null
   and lower(a.address) ~ (
     '(^|[,\n[:space:]])'
     || lower(regexp_replace(c.name, '([.\+*?\[\](){}|^$])', '\\\1', 'g'))
     || '[[:space:]]*$'
   )
), unanimous as (
  select venue_id
  from matched
  group by venue_id
  having count(distinct country_id) = 1
)
select distinct on (m.venue_id)
  m.venue_id,
  null::uuid as city_id,
  m.country_id,
  m.country_code,
  m.source_slug as evidence_source,
  least(1, greatest(0, coalesce(m.confidence, 0.9)))::numeric(3,2) as confidence,
  m.last_seen_at as observed_at,
  'source_address_country_suffix'::text as evidence_kind
from matched m
join unanimous u on u.venue_id = m.venue_id
order by m.venue_id, m.is_primary desc, m.confidence desc nulls last, m.last_seen_at desc;

create temporary table venue_deterministic_geo_candidates on commit drop as
select * from venue_unique_city_geo_candidates
union all
select * from venue_address_country_geo_candidates;

update public.venues v
set city_id = coalesce(v.city_id, c.city_id),
    country_id = c.country_id,
    country = c.country_code,
    geo_linked_at = coalesce(v.geo_linked_at, now()),
    updated_at = now()
from venue_deterministic_geo_candidates c
where v.id = c.venue_id
  and v.country_id is null;

update public.venue_field_provenance p
set is_winning = false
where p.field in ('city_id', 'country_id', 'country')
  and p.is_winning
  and exists (
    select 1 from venue_deterministic_geo_candidates c where c.venue_id = p.venue_id
  );

insert into public.venue_field_provenance
  (venue_id, field, value, source, confidence, is_winning, observed_at)
select c.venue_id, x.field, x.value, c.evidence_source,
       c.confidence, true, c.observed_at
from venue_deterministic_geo_candidates c
cross join lateral (values
  ('city_id'::text, case when c.city_id is null then null else to_jsonb(c.city_id) end),
  ('country_id'::text, to_jsonb(c.country_id)),
  ('country'::text, to_jsonb(c.country_code))
) x(field, value)
where x.value is not null
on conflict (venue_id, field, source) do update
set value = excluded.value,
    confidence = excluded.confidence,
    is_winning = true,
    observed_at = excluded.observed_at;

update public.review_queue r
set status = 'resolved',
    resolved_at = now(),
    details = coalesce(r.details, '{}'::jsonb) || jsonb_build_object(
      'resolution', c.evidence_kind,
      'resolved_automatically', true
    )
from venue_deterministic_geo_candidates c
where r.entity_type = 'venue'
  and r.entity_id = c.venue_id
  and r.review_type = 'venue_missing_country'
  and r.status = 'pending';

insert into public.venue_quality_recompute_queue (venue_id, reason, enqueued_at)
select venue_id, 'deterministic_geo_evidence', now()
from venue_deterministic_geo_candidates
on conflict (venue_id) do update
set reason = excluded.reason,
    enqueued_at = excluded.enqueued_at;

do $assertions$
begin
  if exists (
    select 1
    from venue_deterministic_geo_candidates c
    join public.venues v on v.id = c.venue_id
    where v.country_id is distinct from c.country_id
       or (c.city_id is not null and v.city_id is distinct from c.city_id)
  ) then
    raise exception 'deterministic venue geo candidate did not persist';
  end if;

  if exists (
    select 1
    from public.venue_field_provenance
    where is_winning and field in ('city_id', 'country_id', 'country')
    group by venue_id, field
    having count(*) > 1
  ) then
    raise exception 'deterministic venue geo repair created multiple winning provenance rows';
  end if;
end;
$assertions$;
