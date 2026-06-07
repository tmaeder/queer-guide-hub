-- Phase 4 of the personalities content-quality remediation
-- (docs/plans/2026-06-07-personalities-content-quality-design.md).
--
-- Observability: one RPC the admin surface (and operators) can call to see the
-- real cohort state produced by Phases 0-3 — reconciliation coverage, the
-- archived/triage buckets, the re-queue drain progress, and low-confidence
-- matches that want a human glance. Aggregates only; no per-person data.

create or replace function public.personality_quality_overview()
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  with base as (
    select * from public.personalities where duplicate_of_id is null
  )
  select jsonb_build_object(
    'active',            count(*) filter (where review_status <> 'archived'),
    'anchored',          count(*) filter (where review_status <> 'archived' and wikidata_qid is not null),
    'anchored_pct',      round(100.0 * count(*) filter (where review_status <> 'archived' and wikidata_qid is not null)
                           / nullif(count(*) filter (where review_status <> 'archived'), 0), 1),
    'archived',          count(*) filter (where review_status = 'archived'),
    'triage_insufficient', count(*) filter (where enrichment_status->>'triage' = 'insufficient_data'),
    'pending_requeue',   count(*) filter (where review_status <> 'archived' and wikidata_qid is null and last_refreshed_at is null),
    'needs_attention',   count(*) filter (where review_status <> 'archived' and coalesce(needs_attention, false)),
    'bio_extractable',   count(*) filter (where review_status <> 'archived' and wikidata_qid is null
                            and bio is not null and length(trim(bio)) >= 120
                            and (birth_date is null or profession is null or nationality is null)),
    'low_confidence_matches', (
      select count(distinct s.personality_id)
      from public.personality_sources s
      join base b on b.id = s.personality_id
      where s.source_slug = 'wikidata' and (s.raw->>'match_confidence') = 'low'
    ),
    'computed_at', now()
  )
  from base;
$$;

comment on function public.personality_quality_overview() is
  'Aggregate cohort health for the personalities admin surface (reconciliation coverage, archived/triage buckets, drain progress, low-confidence matches). Phase 4, 2026-06-07.';

grant execute on function public.personality_quality_overview() to authenticated, service_role;
