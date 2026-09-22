-- Finish the safe, source-backed portion of the venue quality rollout.
-- This migration deliberately does not fabricate descriptions, locations,
-- licenses, image relevance, or verification evidence.

-- Existing descriptions count as evidence-backed only when they exactly match
-- a recorded source observation and pass the quality issue detector.
create temporary table venue_description_evidence_candidates on commit drop as
select distinct on (v.id)
  v.id as venue_id,
  v.description,
  s.source_slug,
  least(1, greatest(0, coalesce(s.confidence, 0.7)))::numeric(3,2) as confidence,
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
  and v.description is not null
  and src.description is not null
  and public.venue_description_issue(v.description) is null
  and lower(regexp_replace(btrim(v.description), '\s+', ' ', 'g'))
      = lower(regexp_replace(src.description, '\s+', ' ', 'g'))
order by v.id, s.is_primary desc, s.confidence desc nulls last, s.last_seen_at desc;

update public.venue_field_provenance p
set is_winning = false
where p.field = 'description'
  and p.is_winning
  and exists (
    select 1 from venue_description_evidence_candidates c where c.venue_id = p.venue_id
  );

insert into public.venue_field_provenance
  (venue_id, field, value, source, confidence, is_winning, observed_at)
select venue_id, 'description', to_jsonb(description), source_slug,
       confidence, true, observed_at
from venue_description_evidence_candidates
on conflict (venue_id, field, source) do update
set value = excluded.value,
    confidence = excluded.confidence,
    is_winning = true,
    observed_at = excluded.observed_at;

-- Preserve explicit legacy source identity as a historical observation. Its
-- timestamp is the venue creation time, never migration time, so this cannot
-- manufacture freshness.
insert into public.venue_sources
  (venue_id, source_slug, source_entity_id, source_url, payload, payload_hash,
   confidence, is_primary, first_seen_at, last_seen_at)
select
  v.id,
  btrim(v.data_source),
  'legacy-venue:' || v.id::text,
  case when v.website ~* '^https?://' then v.website end,
  jsonb_build_object(
    'normalized', jsonb_strip_nulls(jsonb_build_object(
      'name', v.name,
      'description', v.description,
      'category', v.category,
      'contacts', jsonb_strip_nulls(jsonb_build_object(
        'website', v.website, 'phone', v.phone, 'email', v.email
      )),
      'hours', v.hours
    )),
    'provenance', jsonb_build_object(
      'kind', 'legacy_venue_snapshot',
      'captured_at', v.created_at
    )
  ) as payload,
  md5(v.id::text || ':' || btrim(v.data_source) || ':' || v.created_at::text),
  0.65,
  true,
  v.created_at,
  v.created_at
from public.venues v
where v.duplicate_of_id is null
  and v.closed_at is null
  and nullif(btrim(v.data_source), '') is not null
  and lower(btrim(v.data_source)) not in ('unknown', 'manual')
  and not exists (select 1 from public.venue_sources s where s.venue_id = v.id)
on conflict (source_slug, source_entity_id) do nothing;

-- Use source categories only when every usable observation agrees on one exact
-- controlled value. Ambiguous labels such as "Bar / Club" remain incomplete.
create temporary table venue_category_evidence_candidates on commit drop as
with observed as (
  select s.venue_id, lower(btrim(s.payload #>> '{normalized,category}')) as category
  from public.venue_sources s
  where lower(btrim(s.payload #>> '{normalized,category}')) = any(array[
    'bar','club','cafe','restaurant','hotel','sauna','cruising','outdoor','shop',
    'community_center','event-venue','theater','gallery','salon','gym','toilet'
  ])
), unanimous as (
  select venue_id, min(category) as category
  from observed
  group by venue_id
  having count(distinct category) = 1
)
select v.id as venue_id, u.category
from public.venues v
join unanimous u on u.venue_id = v.id
where v.duplicate_of_id is null and v.closed_at is null and v.category = 'other';

update public.venues v
set category = c.category
from venue_category_evidence_candidates c
where v.id = c.venue_id;

-- Fill only missing contact fields from syntactically usable source values.
create temporary table venue_contact_evidence_candidates on commit drop as
select distinct on (v.id)
  v.id as venue_id,
  s.source_slug,
  least(1, greatest(0, coalesce(s.confidence, 0.7)))::numeric(3,2) as confidence,
  s.last_seen_at as observed_at,
  case when s.payload #>> '{normalized,contacts,website}' ~* '^https?://[^[:space:]]+$'
    then btrim(s.payload #>> '{normalized,contacts,website}') end as website,
  nullif(btrim(s.payload #>> '{normalized,contacts,phone}'), '') as phone,
  case when s.payload #>> '{normalized,contacts,email}' ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    then lower(btrim(s.payload #>> '{normalized,contacts,email}')) end as email
from public.venues v
join public.venue_sources s on s.venue_id = v.id
where v.duplicate_of_id is null and v.closed_at is null
  and (
    (nullif(btrim(v.website), '') is null and s.payload #>> '{normalized,contacts,website}' ~* '^https?://[^[:space:]]+$')
    or (nullif(btrim(v.phone), '') is null and nullif(btrim(s.payload #>> '{normalized,contacts,phone}'), '') is not null)
    or (nullif(btrim(v.email), '') is null and s.payload #>> '{normalized,contacts,email}' ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
  )
order by v.id, s.is_primary desc, s.confidence desc nulls last, s.last_seen_at desc;

update public.venues v
set website = coalesce(nullif(btrim(v.website), ''), c.website),
    phone = coalesce(nullif(btrim(v.phone), ''), c.phone),
    email = coalesce(nullif(btrim(v.email), ''), c.email)
from venue_contact_evidence_candidates c
where v.id = c.venue_id
  and (c.website is not null or c.phone is not null or c.email is not null);

insert into public.venue_field_provenance
  (venue_id, field, value, source, confidence, is_winning, observed_at)
select c.venue_id, x.field, to_jsonb(x.value), c.source_slug,
       c.confidence, true, c.observed_at
from venue_contact_evidence_candidates c
cross join lateral (values
  ('website', c.website), ('phone', c.phone), ('email', c.email)
) x(field, value)
where x.value is not null
on conflict (venue_id, field, source) do update
set value = excluded.value,
    confidence = excluded.confidence,
    is_winning = true,
    observed_at = excluded.observed_at;

-- Preserve source hours as display text for applicable physical venues. This is
-- intentionally not converted into invented weekday intervals.
create temporary table venue_hours_evidence_candidates on commit drop as
select distinct on (v.id)
  v.id as venue_id,
  s.source_slug,
  least(1, greatest(0, coalesce(s.confidence, 0.7)))::numeric(3,2) as confidence,
  s.last_seen_at as observed_at,
  btrim(s.payload #>> '{normalized,metadata,hours_text}') as hours_text
from public.venues v
join public.venue_sources s on s.venue_id = v.id
where v.duplicate_of_id is null and v.closed_at is null
  and (v.hours is null or v.hours = '{}'::jsonb)
  and v.category <> 'outdoor'
  and nullif(btrim(s.payload #>> '{normalized,metadata,hours_text}'), '') is not null
order by v.id, s.is_primary desc, s.confidence desc nulls last, s.last_seen_at desc;

update public.venues v
set hours = jsonb_build_object(
  'display', c.hours_text,
  'source', c.source_slug,
  'observed_at', c.observed_at
)
from venue_hours_evidence_candidates c
where v.id = c.venue_id;

insert into public.venue_field_provenance
  (venue_id, field, value, source, confidence, is_winning, observed_at)
select venue_id, 'hours', jsonb_build_object('display', hours_text), source_slug,
       confidence, true, observed_at
from venue_hours_evidence_candidates
on conflict (venue_id, field, source) do update
set value = excluded.value,
    confidence = excluded.confidence,
    is_winning = true,
    observed_at = excluded.observed_at;

-- Give irreducible blockers an explicit editorial home rather than guessing.
insert into public.review_queue (entity_type, entity_id, review_type, details)
select 'venue', q.venue_id, 'venue_missing_country',
       jsonb_build_object('source', 'venue_quality_v2', 'blocker', 'missing_country')
from public.venue_quality_snapshots q
where q.blocker_codes @> array['missing_country']::text[]
  and not exists (
    select 1 from public.review_queue r
    where r.entity_type = 'venue' and r.entity_id = q.venue_id
      and r.review_type = 'venue_missing_country' and r.status = 'pending'
  );

create temporary table venue_media_review_priority on commit drop as
select v.id as venue_id
from public.venues v
left join public.venue_quality_snapshots q on q.venue_id = v.id
where v.duplicate_of_id is null and v.closed_at is null
  and coalesce(q.quality_tier, 'listed') = 'listed'
  and not exists (
    select 1
    from public.image_asset_links l
    join public.image_assets a on a.id = l.asset_id
    where l.entity_type = 'venue' and l.entity_id = v.id
      and l.role = 'cover' and a.status = 'active' and not a.is_flagged
      and a.width is not null and a.height is not null
      and nullif(btrim(a.alt_text), '') is not null
      and nullif(btrim(a.license), '') is not null
      and lower(btrim(a.license)) not in ('unknown', 'unverified', 'none')
      and nullif(btrim(a.attribution), '') is not null
  )
order by
  case when v.city = any(array['Berlin','Basel','Zürich','Zurich','New York','Rio de Janeiro','San Francisco','London']) then 0 else 1 end,
  (select count(*) from public.events e where e.venue_id = v.id and e.is_public and e.start_date >= now() - interval '1 day') desc,
  coalesce(q.public_score, 0) desc,
  v.id
limit 1000;

insert into public.review_queue (entity_type, entity_id, review_type, details)
select 'venue', p.venue_id, 'venue_media_evidence',
       jsonb_build_object(
         'source', 'venue_quality_v2',
         'resolution', 'licensed_relevant_cover_required',
         'priority_cohort', true
       )
from venue_media_review_priority p
where not exists (
  select 1 from public.review_queue r
  where r.entity_type = 'venue' and r.entity_id = p.venue_id
    and r.review_type = 'venue_media_evidence' and r.status = 'pending'
);

-- The venue hash backlog is complete. Keep an hourly no-op-safe maintenance
-- run for newly linked assets, and expose the same schedule in the registry.
update public.admin_automations
set schedule = '7 * * * *', updated_at = now()
where slug = 'image_phash_backfill';

do $phash$
declare v_command text;
begin
  select action->>'command' into v_command
  from public.admin_automations where slug = 'image_phash_backfill';
  if v_command is null then
    raise exception 'image_phash_backfill registry row or command is missing';
  end if;
  if exists (select 1 from cron.job where jobname = 'image_phash_backfill') then
    perform cron.unschedule('image_phash_backfill');
  end if;
  perform cron.schedule('image_phash_backfill', '7 * * * *', v_command);
end;
$phash$;

-- Triggers enqueue changed venues. Reconcile untouched snapshots too because
-- provenance/source insertions alter evidence and blocker dimensions.
insert into public.venue_quality_recompute_queue (venue_id, reason, enqueued_at)
select v.id, 'source_evidence_completion', now()
from public.venues v
where v.duplicate_of_id is null and v.closed_at is null
on conflict (venue_id) do update
set reason = excluded.reason, enqueued_at = excluded.enqueued_at;
