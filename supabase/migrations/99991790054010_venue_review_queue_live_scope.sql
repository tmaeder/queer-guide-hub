-- Correct the review scope from the source-evidence rollout: snapshots include
-- historical duplicate/closed/archived venues, but editorial queues must not.
update public.review_queue r
set status = 'resolved',
    resolved_at = now(),
    details = coalesce(r.details, '{}'::jsonb) || jsonb_build_object(
      'resolution', 'non_live_venue_removed_from_queue',
      'resolved_automatically', true
    )
from public.venues v
where r.entity_type = 'venue'
  and r.entity_id = v.id
  and r.review_type = 'venue_missing_country'
  and r.status = 'pending'
  and r.details->>'source' = 'venue_quality_v2'
  and (
    v.duplicate_of_id is not null
    or v.closed_at is not null
    or v.review_status = 'archived'
  );

-- Events can arrive between scheduled linker runs. Keep the production
-- invariant explicit: every upcoming named event is linked or reviewable.
insert into public.review_queue (entity_type, entity_id, review_type, status, details)
select 'event', e.id, 'venue_link_candidate', 'pending',
  jsonb_build_object(
    'event_venue_name', e.venue_name,
    'candidates', '[]'::jsonb,
    'source', 'venue_quality_v2',
    'resolution', 'no_precision_match',
    'ambiguous', true
  )
from public.events e
where e.is_public and e.duplicate_of_id is null
  and e.start_date >= now() - interval '1 day'
  and e.venue_id is null
  and nullif(btrim(e.venue_name), '') is not null
  and not exists (
    select 1 from public.review_queue q
    where q.entity_type = 'event' and q.entity_id = e.id
      and q.review_type = 'venue_link_candidate' and q.status = 'pending'
  );
