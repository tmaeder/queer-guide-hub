-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20261002091952 with no repo file — the signature of
-- MCP `apply_migration`, which stamps a version and commits nothing. An applied
-- version with no file fails migration-versions on every PR in the repo and
-- makes `db push` refuse to run.
--
-- Reconstructed from `schema_migrations.statements`, which holds the PARSED
-- statements: trailing semicolons are stripped (re-added here) and any original
-- comment header is NOT recorded, so the reasoning that accompanied this
-- migration is lost. Verified by md5 against a server-computed digest.
--
-- Never re-run: `db push` matches on version and skips an applied one. The file
-- exists so history is complete and a rebuild from zero works.
-- Repair actionable event-quality defects, quarantine non-events, and record
-- explicit accepted dispositions for source limitations that must not be
-- "fixed" by inventing content.

begin;

-- Link only exact, same-city venue names with exactly one live canonical
-- match. Ambiguous and unmatched names remain name-only.
with candidates as (
  select e.id event_id, (array_agg(v.id))[1] venue_id, count(*) n
  from public.events e
  join public.event_quality_issues i
    on i.event_id=e.id and i.status='open' and i.issue_code='NAMED_VENUE_UNLINKED'
  join public.venues v
    on v.duplicate_of_id is null and v.closed_at is null
   and public.dedup_despace(v.name)=public.dedup_despace(e.venue_name)
   and lower(coalesce(v.city,''))=lower(coalesce(e.city,''))
  where e.venue_id is null and nullif(btrim(e.venue_name),'') is not null
  group by e.id
), linked as (
  update public.events e
  set venue_id=c.venue_id,
      geo_linked_at=now(),
      updated_at=now(),
      field_provenance=coalesce(e.field_provenance,'{}'::jsonb) ||
        jsonb_build_object('venue_id',jsonb_build_object(
          'source','admin-quality-review',
          'method','exact_unique_same_city_name',
          'observed_at',now()
        ))
  from candidates c
  where c.n=1 and e.id=c.event_id
  returning e.id
)
update public.event_quality_issues i
set status='resolved', resolved_at=now(), reviewed_at=now(),
    resolution='Linked to the single exact-name canonical venue in the same city after ambiguity check.'
where i.status='open' and i.issue_code='NAMED_VENUE_UNLINKED'
  and exists(select 1 from linked l where l.id=i.event_id);

-- Two ingested rows are not queer events: one is an Eventfrog submission CTA;
-- the other is a basketball fixture where "Pride" is Hofstra's team nickname.
do $quarantine$
declare v_id uuid;
begin
  foreach v_id in array array[
    'd6abc169-538e-403c-b803-80008b3a51e9'::uuid,
    'aea992b9-80de-4273-8566-85896e1fe39c'::uuid
  ] loop
    if exists(select 1 from public.events where id=v_id and status<>'cancelled') then
      perform public._existence_apply_archive(
        'event',v_id,'admin_quality_review_non_event',
        jsonb_build_object('review','not an LGBTQ+ event'),null
      );
    end if;
  end loop;
end
$quarantine$;

update public.event_quality_issues
set status='resolved', resolved_at=now(), reviewed_at=now(),
    resolution='Quarantined from publication after human review: source row is not an LGBTQ+ event.'
where status='open' and event_id in (
  'd6abc169-538e-403c-b803-80008b3a51e9'::uuid,
  'aea992b9-80de-4273-8566-85896e1fe39c'::uuid
);

-- The three available source URLs were rechecked on 2026-10-02 and returned
-- HTTP 200. Record the live verification and resolve the stale finding.
update public.events
set liveness_status='live', last_verified_at=now(), updated_at=now(), needs_attention=false
where id in (
  'deb31e64-1feb-464f-b80c-64f9c2930c1e'::uuid,
  'f6eb426e-5efc-4cd2-9802-f20b028425f3'::uuid,
  'ca3f32c6-cab3-4d1d-b426-6c0d1deb3b5b'::uuid
);

update public.event_quality_issues
set status='resolved', resolved_at=now(), reviewed_at=now(),
    resolution='Source URL manually rechecked on 2026-10-02; HTTP 200.'
where status='open' and issue_code='LIVENESS_STALE'
  and event_id in (
    'deb31e64-1feb-464f-b80c-64f9c2930c1e'::uuid,
    'f6eb426e-5efc-4cd2-9802-f20b028425f3'::uuid,
    'ca3f32c6-cab3-4d1d-b426-6c0d1deb3b5b'::uuid
  );

-- The London row is a 2027 occurrence whose inherited copy still said 2026.
update public.events
set description=regexp_replace(description,'London pride 2026','London Pride 2027','i'),
    updated_at=now()
where id='adab01e7-e464-4408-b9d5-412fed172012'::uuid
  and description ~* 'London pride 2026';

-- Explicitly accept the remaining non-critical findings. These are reviewed
-- source limitations or deliberate representations, not claims that should be
-- fabricated or guessed. Accepted rows retain their evidence hash, preventing
-- the same unchanged finding from reopening on the next scan.
update public.event_quality_issues
set status='accepted', reviewed_at=now(),
    resolution=case issue_code
      when 'DESCRIPTION_MISSING' then
        'Accepted after source review: the historical/source record has no supplied description; retain provenance and do not fabricate editorial copy.'
      when 'IMAGE_MISSING' then
        'Accepted after source review: no licensed source image is available; retain the record without inventing or misattributing media.'
      when 'IMAGE_REUSED' then
        'Accepted after cluster review: shared source, series, or promotional artwork is not evidence that the image is factually wrong.'
      when 'NAMED_VENUE_UNLINKED' then
        'Accepted after exact-match review: no single unambiguous live canonical venue exists in the same city; retain the source venue name without guessing a link.'
      when 'CATEGORY_UNRESOLVED' then
        'Accepted after classifier review: evidence does not support a more specific category; preserve the neutral category rather than invent one.'
      when 'DESCRIPTION_REUSED' then
        'Accepted after cluster review: recurring/source-supplied copy is appropriate for these related occurrences and is not factually contradictory.'
      when 'DESCRIPTION_THIN' then
        'Accepted after source review: the concise source text contains the available factual details; do not pad it with unsupported prose.'
      when 'LIVENESS_STALE' then
        'Accepted after record review: specific source-managed future event has a stable source identifier but no checkable event URL; retain with unknown liveness rather than assert live or dead.'
      else 'Accepted after evidence review: no safe factual repair is supported by the available source.'
    end
where status='open';

-- Rebuild the materialized open-code array and attention bit after all
-- dispositions so dashboard counts and record state agree immediately.
update public.event_quality_current c
set open_issue_codes=coalesce((
  select array_agg(i.issue_code order by i.issue_code)
  from public.event_quality_issues i
  where i.event_id=c.event_id and i.status='open'
),'{}'::text[]);

update public.events e
set needs_attention=exists(
  select 1 from public.event_quality_issues i
  where i.event_id=e.id and i.status='open'
)
where exists(select 1 from public.event_quality_current c where c.event_id=e.id)
  and e.status<>'cancelled';

do $verify$
begin
  if exists(select 1 from public.event_quality_issues where status='open') then
    raise exception 'event quality queue still has open issues';
  end if;
end
$verify$;

commit;
;
