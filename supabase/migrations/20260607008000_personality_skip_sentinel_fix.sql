-- Correctness + latent-safety fix for the personalities remediation
-- (docs/plans/2026-06-07-personalities-content-quality-design.md).
--
-- ~1,329 "anchored" personalities carry a wikidata_qid of the form 'SKIP_<uuid>'
-- — a sentinel meaning "no Wikidata match, don't retry", written for adult
-- performers. These FAKE anchors:
--   (1) inflated the anchored metric (real Q-numbers are ~3,595, not ~4,925),
--   (2) defeated the outing guard, whose provenance check only tested
--       `wikidata_qid IS NOT NULL` — a SKIP sentinel passed it,
--   (3) caused 404 entity fetches + fake provenance rows in the refresh loop.
--
-- This migration: (a) requires a REAL Q-number (and a non-SKIP source) in the
-- write-time outing guard, (b) counts only real Q-numbers as anchored in the
-- admin metrics + refresh debt vector, and (c) removes the fake SKIP provenance
-- rows. The refresh function is fixed separately to respect SKIP sentinels.

begin;

-- (a) Write-time outing guard: a SKIP sentinel is NOT provenance.
create or replace function public.personalities_enforce_outing_guard()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.is_living
     and (new.visibility = 'public' or new.seo_indexable)
     and new.lgbti_connection in ('community_member', 'ally', 'activist', 'representation')
     and not (coalesce(new.wikidata_qid, '') ~ '^Q[0-9]+$')
     and not exists (
       select 1 from public.personality_sources s
       where s.personality_id = new.id
         and coalesce(s.source_entity_id, '') !~ '^SKIP_'
     )
  then
    new.visibility    := 'draft';
    new.seo_indexable := false;
    new.needs_attention := true;
  end if;
  return new;
end;
$$;

-- (b) Admin metric: anchored = real Q-number only.
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
    'anchored',          count(*) filter (where review_status <> 'archived' and wikidata_qid ~ '^Q[0-9]+$'),
    'anchored_pct',      round(100.0 * count(*) filter (where review_status <> 'archived' and wikidata_qid ~ '^Q[0-9]+$')
                           / nullif(count(*) filter (where review_status <> 'archived'), 0), 1),
    'skip_sentinel',     count(*) filter (where review_status <> 'archived' and wikidata_qid like 'SKIP\_%'),
    'archived',          count(*) filter (where review_status = 'archived'),
    'triage_insufficient', count(*) filter (where enrichment_status->>'triage' = 'insufficient_data'),
    'pending_requeue',   count(*) filter (where review_status <> 'archived' and not (coalesce(wikidata_qid,'') ~ '^Q[0-9]+$')
                           and last_refreshed_at is null
                           and (enrichment_status->>'triage') is distinct from 'insufficient_data'
                           and wikidata_qid is null),
    'needs_attention',   count(*) filter (where review_status <> 'archived' and coalesce(needs_attention, false)),
    'bio_extractable',   count(*) filter (where review_status <> 'archived' and not (coalesce(wikidata_qid,'') ~ '^Q[0-9]+$')
                            and bio is not null and length(trim(bio)) >= 120
                            and (birth_date is null or profession is null or nationality is null)),
    'has_connection',    count(*) filter (where review_status <> 'archived'
                            and lgbti_connection is not null and lgbti_connection not in ('unclear','none_known')),
    'flagged_nonperson', count(*) filter (where review_status <> 'archived'
                            and enrichment_status->>'entity_kind' is not null
                            and enrichment_status->>'entity_kind' <> 'person'),
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

grant execute on function public.personality_quality_overview() to authenticated, service_role;

-- (c) Remove fake SKIP provenance rows (they assert nothing).
delete from public.personality_sources
 where source_slug = 'wikidata' and source_entity_id like 'SKIP\_%';

commit;
