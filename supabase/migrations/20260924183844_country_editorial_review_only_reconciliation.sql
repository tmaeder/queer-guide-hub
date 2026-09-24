begin;

-- A concurrent deployment briefly restored the legacy auto-publish branch
-- while the completion batch was running. Reject every citation-free draft
-- created by that branch and retract its direct country writes. Historic
-- published revisions remain audit records; only the fresh, unreviewed copy is
-- removed from the public row.
update public.editorial_drafts legacy
set reviewer_note=concat_ws(E'\n',legacy.reviewer_note,
  'Superseded citation-free generated revision preserved: '
  || jsonb_build_object('id',bad.id,'hook',bad.draft_hook,'long',bad.draft_long,
       'generated_at',bad.generated_at,'model',bad.model)::text)
from public.editorial_drafts bad
where legacy.entity_type='country' and legacy.entity_id=bad.entity_id
  and legacy.model='legacy-country-remediation' and legacy.status='rejected'
  and bad.entity_type='country' and bad.status='pending'
  and bad.generated_at >= '2026-09-24 18:20:00+00'
  and coalesce(jsonb_array_length(bad.citations),0)=0;

with bad_pending as (
  delete from public.editorial_drafts
  where entity_type='country' and status='pending'
    and generated_at >= '2026-09-24 18:20:00+00'
    and coalesce(jsonb_array_length(citations),0)=0
  returning entity_id
), bad_published as (
  select c.id
  from public.countries c
  where c.enrichment_status->'editorial'->>'state'='published'
    and (c.enrichment_status->'editorial'->>'at')::timestamptz >= '2026-09-24 18:20:00+00'
    and exists (
      select 1 from public.editorial_drafts legacy
      where legacy.entity_type='country' and legacy.entity_id=c.id
        and legacy.model='legacy-country-remediation' and legacy.status='rejected'
    )
), affected as (
  select entity_id id from bad_pending
  union select id from bad_published
)
update public.countries c
set description=null, editorial_hook=null, editorial_long=null,
    enrichment_status=jsonb_set(coalesce(c.enrichment_status,'{}'::jsonb),
      '{editorial}',jsonb_build_object(
        'state','queued','reason','superseded_auto_publish_retracted','at',now()),true),
    updated_at=now()
where c.id in (select id from affected);

commit;
