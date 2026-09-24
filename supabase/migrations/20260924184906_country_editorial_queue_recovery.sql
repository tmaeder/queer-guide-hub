begin;

-- Recover countries whose generated review draft was removed by a concurrent
-- queue reconciliation while the production completion run was active. Public
-- prose remains null; this only makes the idempotent review-only generator
-- select them again.
update public.countries c
set enrichment_status=jsonb_set(coalesce(c.enrichment_status,'{}'::jsonb),
      '{editorial}',jsonb_build_object(
        'state','queued','reason','pending_draft_missing','at',now()),true),
    updated_at=now()
where c.duplicate_of_id is null
  and c.enrichment_status->'editorial'->>'state'='review'
  and c.description is null and c.editorial_hook is null and c.editorial_long is null
  and not exists (
    select 1 from public.editorial_drafts d
    where d.entity_type='country' and d.entity_id=c.id and d.status='pending'
  );

commit;
