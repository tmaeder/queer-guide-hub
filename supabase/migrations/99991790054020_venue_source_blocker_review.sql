-- The five live records with neither a source observation nor a legacy source
-- label cannot be repaired automatically without inventing evidence. Make the
-- blocker actionable and keep the records suppressed until reviewed.
insert into public.review_queue (entity_type, entity_id, review_type, status, details)
select 'venue', q.venue_id, 'venue_source_evidence', 'pending',
  jsonb_build_object(
    'source', 'venue_quality_v2',
    'blocker', 'no_source',
    'resolution', 'source_observation_required'
  )
from public.venue_quality_snapshots q
join public.venues v on v.id = q.venue_id
where v.duplicate_of_id is null
  and v.closed_at is null
  and v.review_status is distinct from 'archived'
  and q.blocker_codes @> array['no_source']::text[]
  and not exists (
    select 1 from public.review_queue r
    where r.entity_type = 'venue' and r.entity_id = q.venue_id
      and r.review_type = 'venue_source_evidence' and r.status = 'pending'
  );
