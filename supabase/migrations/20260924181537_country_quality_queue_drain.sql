begin;

-- Close stale category queue entries for events the deterministic classifier
-- has already moved away from the catch-all value.
update public.review_queue q
set status='resolved', resolved_at=now(),
    details=coalesce(q.details,'{}'::jsonb)||jsonb_build_object(
      'resolution','classifier_applied','resolved_at',now())
from public.events e
where q.entity_type='event' and q.entity_id=e.id
  and q.review_type='COUNTRY_CATEGORY_UNCLASSIFIED' and q.status='pending'
  and e.event_type<>'other';

-- A completed classifier pass with no reliable signal is a legitimate,
-- explicitly examined `other`, not an unexamined record.
update public.review_queue q
set status='resolved', resolved_at=now(),
    details=coalesce(q.details,'{}'::jsonb)||jsonb_build_object(
      'resolution','intentional_other','reason','classifier_no_reliable_signal','resolved_at',now())
from public.events e
where q.entity_type='event' and q.entity_id=e.id
  and q.review_type='COUNTRY_CATEGORY_UNCLASSIFIED' and q.status='pending'
  and e.event_type='other' and e.enrichment_status?'event_type_backfill';

-- Non-GayCities rows were outside the source-specific classifier's rewrite
-- authority. Record the absence of a trustworthy signal and retain `other`.
update public.events e
set enrichment_status=jsonb_set(coalesce(e.enrichment_status,'{}'::jsonb),
  '{event_type_backfill}',jsonb_build_object('from','other','to',null,
    'confidence',0,'status','no_signal','source','country_quality_completion'),true)
where e.duplicate_of_id is null and e.event_type='other'
  and not (coalesce(e.enrichment_status,'{}'::jsonb)?'event_type_backfill');

update public.review_queue q
set status='resolved', resolved_at=now(),
    details=coalesce(q.details,'{}'::jsonb)||jsonb_build_object(
      'resolution','intentional_other','reason','no_exact_source_mapping_or_reliable_signal','resolved_at',now())
from public.events e
where q.entity_type='event' and q.entity_id=e.id
  and q.review_type='COUNTRY_CATEGORY_UNCLASSIFIED' and q.status='pending'
  and e.event_type='other';

commit;
