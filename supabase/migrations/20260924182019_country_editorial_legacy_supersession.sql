begin;

-- The compatibility copies preserved during leak retraction contain no source
-- citations, so they cannot satisfy the new publication contract. Keep them
-- as an auditable rejected revision and reopen the country for a grounded
-- replacement draft.
with superseded as (
  update public.editorial_drafts
  set status='rejected', reviewed_at=now(),
      reviewer_note=concat_ws(E'\n',reviewer_note,
        'Superseded automatically: legacy public copy had no citations; grounded replacement requested.')
  where entity_type='country' and status='pending'
    and model='legacy-country-remediation'
  returning entity_id
)
update public.countries c
set enrichment_status=jsonb_set(coalesce(c.enrichment_status,'{}'::jsonb),
      '{editorial}',jsonb_build_object(
        'state','queued','reason','legacy_draft_missing_citations',
        'at',now()),true),
    updated_at=now()
where c.id in (select entity_id from superseded)
  and c.description is null and c.editorial_hook is null
  and c.editorial_long is null;

commit;
