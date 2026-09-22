-- Close deterministic review residue and add one authoritative source that was
-- independently confirmed during the rollout. Ambiguous records remain queued.

with source_row as (
  select
    '91486d24-8eb1-4cec-b0dc-629692440692'::uuid as venue_id,
    'https://www.electrowerkz.co.uk/'::text as source_url,
    jsonb_build_object(
      'normalized', jsonb_build_object(
        'name', 'Electrowerkz',
        'description', 'A late 19th-century industrial warehouse event space and club with seven spaces across five levels.',
        'website', 'https://www.electrowerkz.co.uk/',
        'email', 'enquiries@electrowerkz.co.uk',
        'phone', '+442078376419',
        'address', '7 Torrens Street, London EC1V 1NQ',
        'location', jsonb_build_object('country_code', 'GB', 'city', 'London')
      ),
      'evidence_kind', 'official_venue_website',
      'observed_at', '2026-09-22T17:45:00Z'
    ) as payload
)
insert into public.venue_sources (
  venue_id, source_slug, source_entity_id, source_url, payload, payload_hash,
  confidence, is_primary, first_seen_at, last_seen_at
)
select
  venue_id, 'official_website', source_url, source_url, payload,
  md5(payload::text), 1.000, true, now(), now()
from source_row
on conflict (source_slug, source_entity_id) do update
set venue_id = excluded.venue_id,
    source_url = excluded.source_url,
    payload = excluded.payload,
    payload_hash = excluded.payload_hash,
    confidence = excluded.confidence,
    is_primary = true,
    last_seen_at = excluded.last_seen_at;

insert into public.venue_field_provenance
  (venue_id, field, value, source, confidence, is_winning, observed_at)
select v.id, x.field, x.value, 'official_website', 1.000, true, now()
from public.venues v
cross join lateral (values
  ('description'::text, to_jsonb(v.description)),
  ('website'::text, to_jsonb(v.website)),
  ('email'::text, to_jsonb(v.email)),
  ('phone'::text, to_jsonb(v.phone)),
  ('address'::text, to_jsonb(v.address))
) x(field, value)
where v.id = '91486d24-8eb1-4cec-b0dc-629692440692'::uuid
  and x.value is not null
on conflict (venue_id, field, source) do update
set value = excluded.value,
    confidence = excluded.confidence,
    is_winning = true,
    observed_at = excluded.observed_at;

update public.review_queue
set status = 'resolved',
    resolved_at = now(),
    details = coalesce(details, '{}'::jsonb) || jsonb_build_object(
      'resolution', 'official_source_observed',
      'source_url', 'https://www.electrowerkz.co.uk/',
      'resolved_automatically', true
    )
where entity_type = 'venue'
  and entity_id = '91486d24-8eb1-4cec-b0dc-629692440692'::uuid
  and review_type = 'venue_source_evidence'
  and status = 'pending';

create or replace function public.resolve_event_venue_link_reviews()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $resolve$
begin
  if new.venue_id is not null and old.venue_id is distinct from new.venue_id then
    update public.review_queue
    set status = 'resolved',
        resolved_at = now(),
        details = coalesce(details, '{}'::jsonb) || jsonb_build_object(
          'resolution', 'venue_linked',
          'venue_id', new.venue_id,
          'resolved_automatically', true
        )
    where entity_type = 'event'
      and entity_id = new.id
      and review_type = 'venue_link_candidate'
      and status = 'pending';
  end if;
  return new;
end;
$resolve$;

revoke all on function public.resolve_event_venue_link_reviews() from public, anon, authenticated;

drop trigger if exists trg_resolve_event_venue_link_reviews on public.events;
create trigger trg_resolve_event_venue_link_reviews
after update of venue_id on public.events
for each row execute function public.resolve_event_venue_link_reviews();

-- Resolve review rows that were made obsolete before the trigger existed.
update public.review_queue r
set status = 'resolved',
    resolved_at = now(),
    details = coalesce(r.details, '{}'::jsonb) || jsonb_build_object(
      'resolution', case when e.venue_id is not null then 'venue_linked' else 'event_no_longer_actionable' end,
      'venue_id', e.venue_id,
      'resolved_automatically', true
    )
from public.events e
where r.entity_type = 'event'
  and r.entity_id = e.id
  and r.review_type = 'venue_link_candidate'
  and r.status = 'pending'
  and (
    e.venue_id is not null
    or e.duplicate_of_id is not null
    or not e.is_public
    or e.start_date < now() - interval '1 day'
    or nullif(btrim(e.venue_name), '') is null
  );

-- The finite metadata backlog has converged. Retain hourly maintenance for new
-- assets instead of spending one Edge invocation per minute on an empty queue.
update public.admin_automations
set schedule = '17 * * * *',
    description = 'Hourly maintenance for factual dimensions, bytes, and format on newly linked venue images. Rights, alt text, attribution, and relevance remain review-gated.',
    updated_at = now()
where slug = 'venue_image_metadata';

select public.sync_automations_to_cron(true);

do $assert$
begin
  if not exists (
    select 1 from public.venue_sources
    where venue_id = '91486d24-8eb1-4cec-b0dc-629692440692'::uuid
      and source_slug = 'official_website'
      and source_url = 'https://www.electrowerkz.co.uk/'
  ) then
    raise exception 'Electrowerkz official source was not persisted';
  end if;

  if exists (
    select 1
    from public.review_queue r
    join public.events e on e.id = r.entity_id
    where r.entity_type = 'event'
      and r.review_type = 'venue_link_candidate'
      and r.status = 'pending'
      and (e.venue_id is not null or e.duplicate_of_id is not null or not e.is_public
        or e.start_date < now() - interval '1 day')
  ) then
    raise exception 'stale event venue-link review rows remain pending';
  end if;
end;
$assert$;
