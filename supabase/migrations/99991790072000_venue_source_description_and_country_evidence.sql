-- Continue the venue quality rollout with only deterministic source evidence.
-- No prose is generated and no country is inferred from a name or an unsafe
-- coordinate. Descriptions must be recent, high-confidence source text; country
-- links must resolve unanimously from an explicit source country value.

create temporary table venue_description_fill_candidates on commit drop as
select distinct on (v.id)
  v.id as venue_id,
  src.description,
  s.source_slug,
  least(1, greatest(0, coalesce(s.confidence, 0.9)))::numeric(3,2) as confidence,
  s.last_seen_at as observed_at
from public.venues v
join public.venue_sources s on s.venue_id = v.id
cross join lateral (
  select coalesce(
    nullif(btrim(s.payload #>> '{normalized,description}'), ''),
    nullif(btrim(s.payload #>> '{normalized,metadata,description}'), ''),
    nullif(btrim(s.payload #>> '{raw,description}'), '')
  ) as description
) src
where v.duplicate_of_id is null
  and v.closed_at is null
  and v.review_status is distinct from 'archived'
  and nullif(btrim(v.description), '') is null
  and src.description is not null
  and length(src.description) >= 120
  and public.venue_description_issue(src.description) is null
  and coalesce(s.confidence, 0) >= 0.9
  and s.last_seen_at >= now() - interval '180 days'
order by v.id, s.is_primary desc, s.confidence desc nulls last, s.last_seen_at desc;

update public.venues v
set description = c.description,
    updated_at = now()
from venue_description_fill_candidates c
where v.id = c.venue_id
  and nullif(btrim(v.description), '') is null;

update public.venue_field_provenance p
set is_winning = false
where p.field = 'description'
  and p.is_winning
  and exists (
    select 1 from venue_description_fill_candidates c where c.venue_id = p.venue_id
  );

insert into public.venue_field_provenance
  (venue_id, field, value, source, confidence, is_winning, observed_at)
select venue_id, 'description', to_jsonb(description), source_slug,
       confidence, true, observed_at
from venue_description_fill_candidates
on conflict (venue_id, field, source) do update
set value = excluded.value,
    confidence = excluded.confidence,
    is_winning = true,
    observed_at = excluded.observed_at;

-- Resolve only explicit source country values. A value can be an ISO alpha-2
-- code (for example GP) or the canonical countries.name (United States).
-- Multiple usable observations must agree on the same country row.
create temporary table venue_country_link_candidates on commit drop as
with observed as (
  select
    v.id as venue_id,
    s.source_slug,
    s.is_primary,
    s.confidence,
    s.last_seen_at,
    coalesce(
      nullif(btrim(s.payload #>> '{normalized,location,country_code}'), ''),
      nullif(btrim(s.payload #>> '{normalized,location,country}'), '')
    ) as country_signal
  from public.venues v
  join public.venue_sources s on s.venue_id = v.id
  join public.venue_quality_snapshots q on q.venue_id = v.id
  where v.duplicate_of_id is null
    and v.closed_at is null
    and v.review_status is distinct from 'archived'
    and v.country_id is null
    and q.blocker_codes @> array['missing_country']::text[]
), matched as (
  select o.*, c.id as country_id, c.code as country_code
  from observed o
  join public.countries c
    on upper(o.country_signal) = upper(c.code)
    or lower(o.country_signal) = lower(c.name)
  where o.country_signal is not null
    and lower(o.country_signal) <> 'various locations'
), unanimous as (
  select venue_id
  from matched
  group by venue_id
  having count(distinct country_id) = 1
)
select distinct on (m.venue_id)
  m.venue_id,
  m.country_id,
  m.country_code,
  m.source_slug,
  least(1, greatest(0, coalesce(m.confidence, 0.9)))::numeric(3,2) as confidence,
  m.last_seen_at as observed_at
from matched m
join unanimous u on u.venue_id = m.venue_id
order by m.venue_id, m.is_primary desc, m.confidence desc nulls last, m.last_seen_at desc;

update public.venues v
set country_id = c.country_id,
    country = c.country_code,
    geo_linked_at = coalesce(v.geo_linked_at, now()),
    updated_at = now()
from venue_country_link_candidates c
where v.id = c.venue_id
  and v.country_id is null;

update public.venue_field_provenance p
set is_winning = false
where p.field in ('country_id', 'country')
  and p.is_winning
  and exists (
    select 1 from venue_country_link_candidates c where c.venue_id = p.venue_id
  );

insert into public.venue_field_provenance
  (venue_id, field, value, source, confidence, is_winning, observed_at)
select c.venue_id, x.field, x.value, c.source_slug,
       c.confidence, true, c.observed_at
from venue_country_link_candidates c
cross join lateral (values
  ('country_id'::text, to_jsonb(c.country_id)),
  ('country'::text, to_jsonb(c.country_code))
) x(field, value)
on conflict (venue_id, field, source) do update
set value = excluded.value,
    confidence = excluded.confidence,
    is_winning = true,
    observed_at = excluded.observed_at;

update public.review_queue r
set status = 'resolved',
    resolved_at = now(),
    details = coalesce(r.details, '{}'::jsonb) || jsonb_build_object(
      'resolution', 'source_country_linked',
      'resolved_automatically', true
    )
where r.entity_type = 'venue'
  and r.review_type = 'venue_missing_country'
  and r.status = 'pending'
  and exists (
    select 1 from venue_country_link_candidates c where c.venue_id = r.entity_id
  );

-- Backfill category provenance where the current controlled category exactly
-- agrees with a source observation. This changes no public field; it closes the
-- audit gap left by the earlier unanimous category repair.
create temporary table venue_category_provenance_candidates on commit drop as
select distinct on (v.id)
  v.id as venue_id,
  v.category,
  s.source_slug,
  least(1, greatest(0, coalesce(s.confidence, 0.9)))::numeric(3,2) as confidence,
  s.last_seen_at as observed_at
from public.venues v
join public.venue_sources s on s.venue_id = v.id
where v.duplicate_of_id is null
  and v.closed_at is null
  and v.review_status is distinct from 'archived'
  and v.category <> 'other'
  and lower(btrim(s.payload #>> '{normalized,category}')) = v.category
order by v.id, s.is_primary desc, s.confidence desc nulls last, s.last_seen_at desc;

update public.venue_field_provenance p
set is_winning = false
where p.field = 'category'
  and p.is_winning
  and exists (
    select 1 from venue_category_provenance_candidates c where c.venue_id = p.venue_id
  );

insert into public.venue_field_provenance
  (venue_id, field, value, source, confidence, is_winning, observed_at)
select venue_id, 'category', to_jsonb(category), source_slug,
       confidence, true, observed_at
from venue_category_provenance_candidates
on conflict (venue_id, field, source) do update
set value = excluded.value,
    confidence = excluded.confidence,
    is_winning = true,
    observed_at = excluded.observed_at;

insert into public.venue_quality_recompute_queue (venue_id, reason, enqueued_at)
select changed.venue_id, string_agg(changed.reason, '+'), now()
from (
  select venue_id, 'source_description_evidence'::text as reason
  from venue_description_fill_candidates
  union all
  select venue_id, 'source_country_evidence'::text as reason
  from venue_country_link_candidates
) changed
group by changed.venue_id
on conflict (venue_id) do update
set reason = excluded.reason,
    enqueued_at = excluded.enqueued_at;

do $assertions$
begin
  if exists (
    select 1
    from public.venue_field_provenance
    where is_winning and field in ('description', 'country_id', 'country', 'category')
    group by venue_id, field
    having count(*) > 1
  ) then
    raise exception 'venue evidence remediation created multiple winning provenance rows';
  end if;

  if exists (
    select 1
    from venue_country_link_candidates c
    join public.venues v on v.id = c.venue_id
    where v.country_id is distinct from c.country_id
  ) then
    raise exception 'venue source country candidate did not persist';
  end if;
end;
$assertions$;
