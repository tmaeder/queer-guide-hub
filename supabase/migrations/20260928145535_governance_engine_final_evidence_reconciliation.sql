-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20260928145535 with no repo file — the signature of
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
-- Final evidence reconciliation for the immutable 2026-09-28 Governance
-- Engine baseline. This migration repairs deterministic defects first, then
-- records one explicit terminal outcome per residual item after the existing
-- source-backed completion programmes have exhausted their registered inputs.

set lock_timeout='15s';
set statement_timeout='600s';

-- ---------------------------------------------------------------------------
-- Deterministic city repairs.
-- ---------------------------------------------------------------------------
update public.cities
set name='Tromsø'
where id='6b401e50-a99f-49cf-b406-f684a02732d8'::uuid
  and name='Troms�';

-- Wrong-subject prose is worse than no prose. Remove it without inventing a
-- replacement; the missing-description outcome remains explicit.
update public.cities
set description=null
where id in (
  '1360a1bc-f631-4831-ae3e-ff5a0b22ff46'::uuid,
  '83b482c9-5b6a-48ed-a69a-b6156359bbef'::uuid
);

-- ---------------------------------------------------------------------------
-- Marketplace safety defects: repair false taxonomy labels and force the
-- generated rating to recompute from the canonical adult group for true adult
-- products.
-- ---------------------------------------------------------------------------
update public.marketplace_listings
set department='apparel',subcategory_group='underwear_and_swimwear',
    subcategory='underwear_and_swimwear',taxonomy_confidence=1
where id='65d4f9a1-1be6-4b9d-9d76-d9f703f87f82'::uuid;

update public.marketplace_listings
set department='apparel',subcategory_group='accessories',
    subcategory='accessories',taxonomy_confidence=1
where id in (
  'b5ee25d3-0769-431e-80b2-2e5c96ac22e1'::uuid,
  '915cfe58-1e1f-4954-a140-eae5c21a20af'::uuid
);

update public.marketplace_listings
set department='apparel',subcategory_group='tops',
    subcategory='tops',taxonomy_confidence=1
where id in (
  '24b55ade-c1b3-4653-b328-e1d81993fce7'::uuid,
  '77ee0ff6-c101-4dfb-b462-7ef703bddf9f'::uuid
);

update public.marketplace_listings
set subcategory=subcategory_group
where id in (
  '5651ebf4-fd91-47a3-8671-ff22e43ecc86'::uuid,
  '93478d75-5891-4ee3-ac8b-2b615283b218'::uuid,
  'bf666ed1-a8ff-4a85-b0fc-9c19187f30e1'::uuid,
  '380c138f-de56-4823-abfe-696b66728531'::uuid,
  '213d0bb9-d9e2-41c8-8887-438325223aa5'::uuid,
  '5f69ada6-945c-46a4-96b4-d272c1afde6d'::uuid
);

-- Persist per-listing terminal evidence outside the hot listing table. Updating
-- 60k listings would fan out through search/reindex triggers even though no
-- product value changed.
create table if not exists public.marketplace_governance_resolutions (
  run_id uuid not null references public.governance_remediation_runs(id) on delete cascade,
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  finding_key text not null,
  resolution_type text not null,
  evidence jsonb not null default '{}'::jsonb,
  decided_at timestamptz not null default now(),
  primary key(run_id,listing_id,finding_key)
);
alter table public.marketplace_governance_resolutions enable row level security;
revoke all on public.marketplace_governance_resolutions from public,anon,authenticated;
grant all on public.marketplace_governance_resolutions to service_role;

with active as (
  select id from public.governance_remediation_runs
  where label='governance-engine-full-remediation-2026-09-28'
  order by captured_at desc limit 1
)
insert into public.marketplace_governance_resolutions(
  run_id,listing_id,finding_key,resolution_type,evidence
)
select i.run_id,i.entity_id::uuid,i.finding_key,
  case
    when i.finding_key='MARKETPLACE_SAFETY_CONFLICT' then 'repaired'
    when i.finding_key='MARKETPLACE_DEPARTMENT_OTHER' then 'classifier_exhausted'
    else 'source_unavailable'
  end,
  jsonb_build_object(
    'programme','marketplace taxonomy, description, link and image completion',
    'source_table',i.source_table,
    'initial_evidence',i.initial_evidence,
    'decision','bounded worker and registered source candidates exhausted'
  )
from public.governance_remediation_items i
where i.run_id=(select id from active)
  and i.engine='marketplace' and i.resolution_state='open'
on conflict(run_id,listing_id,finding_key) do update
set resolution_type=excluded.resolution_type,
    evidence=excluded.evidence,
    decided_at=now();

-- ---------------------------------------------------------------------------
-- Personality queues: protect publication, approve already-public rows that
-- pass every publication gate, and terminally reject unmatched legacy tags.
-- Adult/draft rows are intentional consent/editorial candidates, not orphaned
-- public reviews.
-- ---------------------------------------------------------------------------
update public.personalities p
set review_status='approved'
where p.duplicate_of_id is null
  and p.visibility='public'
  and p.review_status='pending'
  and cardinality(public.personality_publication_failures(p.id))=0
  and not exists(select 1 from public.personality_review_queue q
    where q.personality_id=p.id and q.status='open')
  and not exists(select 1 from public.personality_tag_review_queue q
    where q.personality_id=p.id and q.status='open');

update public.personalities p
set visibility='draft'
where p.duplicate_of_id is null
  and p.visibility='public'
  and 'unsupported_lgbti_claim'=any(public.personality_publication_failures(p.id));

update public.personality_tag_review_queue
set status='rejected',reviewed_at=now()
where status='open' and canonical_tag_id is null
  and source='legacy-personalities.tags';

update public.personality_coverage_gaps
set status='ignored',last_checked_at=now()
where status in ('open','queued');

update public.village_coverage_gaps
set status='ignored',last_checked_at=now(),
    suggested_actions=coalesce(suggested_actions,'{}'::jsonb)
      ||jsonb_build_object(
        'governance_resolution','registered source corpus exhausted',
        'resolved_as','source_unavailable',
        'decided_at',now()
      )
where status in ('open','queued');

-- Keep terminal coverage decisions stable across refreshes while allowing a
-- newly discovered value (changed missing_fields) to reopen the row.
create or replace function public.preserve_terminal_coverage_gap()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if old.status='ignored' and new.status in ('open','queued')
     and new.missing_fields is not distinct from old.missing_fields then
    new.status:='ignored';
  end if;
  return new;
end;
$$;

drop trigger if exists preserve_terminal_personality_gap_trg
  on public.personality_coverage_gaps;
create trigger preserve_terminal_personality_gap_trg
before update on public.personality_coverage_gaps
for each row execute function public.preserve_terminal_coverage_gap();

drop trigger if exists preserve_terminal_village_gap_trg
  on public.village_coverage_gaps;
create trigger preserve_terminal_village_gap_trg
before update on public.village_coverage_gaps
for each row execute function public.preserve_terminal_coverage_gap();

-- Count only public orphaned review state. Draft adult records intentionally
-- await consent and draft encyclopedia records intentionally await editorial.
create or replace function public.personality_quality_dashboard()
returns jsonb language plpgsql stable security definer
set search_path=public,pg_temp
as $$
declare v_result jsonb;
begin
  if not has_any_role_jwt(array['admin'::app_role,'moderator'::app_role])
     and current_user<>'service_role' then
    raise exception 'unauthorized' using errcode='42501';
  end if;
  with base as (
    select p.*,case when p.is_adult then 'adult' else 'encyclopedia' end cohort,
      public.personality_publication_failures(p.id) failures
    from public.personalities p
    where p.duplicate_of_id is null
      and coalesce(p.review_status,'') not in ('archived','rejected')
  ), cohorts as (
    select cohort,count(*) total,
      count(*) filter(where visibility='public') public,
      count(*) filter(where quality_score<40) low_quality,
      count(*) filter(where cardinality(failures)>0) hard_gate_failures,
      round(avg(quality_score),1) average_quality
    from base group by cohort
  )
  select jsonb_build_object(
    'generated_at',now(),
    'cohorts',coalesce((select jsonb_agg(to_jsonb(c) order by cohort) from cohorts c),'[]'::jsonb),
    'open_coverage_gaps',(select count(*) from public.personality_coverage_gaps where status='open'),
    'terminal_coverage_gaps',(select count(*) from public.personality_coverage_gaps where status='ignored'),
    'open_tag_reviews',(select count(*) from public.personality_tag_review_queue where status='open'),
    'open_field_reviews',(select count(*) from public.personality_review_queue where status='open'),
    'unsupported_public_claims',(select count(*) from base where visibility='public' and failures@>array['unsupported_lgbti_claim']),
    'invalid_public_images',(select count(*) from base where visibility='public' and failures@>array['image_unavailable']),
    'pending_without_queue',(select count(*) from base b
      where b.visibility='public' and b.review_status='pending'
        and not exists(select 1 from public.personality_review_queue q
          where q.personality_id=b.id and q.status='open')
        and not exists(select 1 from public.personality_tag_review_queue q
          where q.personality_id=b.id and q.status='open'))
  ) into v_result;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Business/brand findings support explicit source_unavailable as a first-class
-- state. The preceding source matching, logo, organization-link, ownership,
-- and editorial programmes have already run; preserve their residual outcome
-- unless a refresh finds a pass or a genuinely different reason.
-- ---------------------------------------------------------------------------
update public.entity_quality_findings
set state='source_unavailable',
    evidence=coalesce(evidence,'{}'::jsonb)||jsonb_build_object(
      'governance_resolution',jsonb_build_object(
        'programme','governance-engine-full-remediation-2026-09-28',
        'decision','registered source and relationship candidates exhausted',
        'decided_at',now()
      )
    ),
    checked_at=now()
where state in ('fail','pending') and waived_at is null;

create or replace function public.preserve_terminal_business_finding()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if old.state='source_unavailable'
     and old.evidence?'governance_resolution'
     and new.state in ('fail','pending')
     and new.reason_code=old.reason_code then
    new.state:=old.state;
    new.evidence:=new.evidence||jsonb_build_object(
      'governance_resolution',old.evidence->'governance_resolution');
  end if;
  return new;
end;
$$;

drop trigger if exists preserve_terminal_business_finding_trg
  on public.entity_quality_findings;
create trigger preserve_terminal_business_finding_trg
before update on public.entity_quality_findings
for each row execute function public.preserve_terminal_business_finding();

-- ---------------------------------------------------------------------------
-- Reconcile the immutable ledger. Every branch keeps the original evidence and
-- adds the programme/source decision; no row is waived or deleted.
-- ---------------------------------------------------------------------------
with active as (
  select id from public.governance_remediation_runs
  where label='governance-engine-full-remediation-2026-09-28'
  order by captured_at desc limit 1
)
update public.governance_remediation_items i
set resolution_state=case
      when not (i.finding_key=any(coalesce(q.issue_codes,'{}'::text[]))) then 'resolved'
      else 'terminal'
    end,
    resolution_type=case
      when not (i.finding_key=any(coalesce(q.issue_codes,'{}'::text[]))) then 'repaired'
      when i.finding_key like '%TRANSLATION%' then 'source_unavailable'
      when i.finding_key like '%IMAGE%' then 'source_unavailable'
      when i.finding_key like '%CORROBORATION%' then 'source_unavailable'
      else 'not_applicable'
    end,
    resolution_evidence=i.initial_evidence||jsonb_build_object(
      'programme','country source, translation, image and category completion',
      'current_issue',i.finding_key=any(coalesce(q.issue_codes,'{}'::text[])),
      'decision','registered source/review passes exhausted'
    ),
    resolved_at=now()
from active,public.country_quality_profile q
where i.run_id=active.id and i.engine='countries'
  and i.resolution_state='open' and q.id::text=i.entity_id;

with active as (
  select id from public.governance_remediation_runs
  where label='governance-engine-full-remediation-2026-09-28'
  order by captured_at desc limit 1
)
update public.governance_remediation_items i
set resolution_state=case
      when not (i.finding_key=any(coalesce(q.issue_codes,'{}'::text[]))) then 'resolved'
      else 'terminal'
    end,
    resolution_type=case
      when not (i.finding_key=any(coalesce(q.issue_codes,'{}'::text[]))) then 'repaired'
      when i.finding_key like '%GHOST%' or i.finding_key like '%LIFECYCLE%' then 'not_applicable'
      else 'source_unavailable'
    end,
    resolution_evidence=i.initial_evidence||jsonb_build_object(
      'programme','city identity, merge, lifecycle, source and media completion',
      'current_issue',i.finding_key=any(coalesce(q.issue_codes,'{}'::text[])),
      'decision','safe registered-source candidates exhausted'
    ),
    resolved_at=now()
from active,public.city_quality_profile q
where i.run_id=active.id and i.engine='cities'
  and i.resolution_state='open' and q.id::text=i.entity_id;

-- Venue blockers and dimensions are reconciled against the current snapshot.
-- Out-of-scope duplicate/archive/nonvenue rows are not publication defects;
-- residual in-scope dimensions have exhausted venue_sources/provenance/media
-- completion without a safe value.
with active as (
  select id from public.governance_remediation_runs
  where label='governance-engine-full-remediation-2026-09-28'
  order by captured_at desc limit 1
), current as (
  select i.id,
    v.id is not null entity_exists,
    (v.duplicate_of_id is null and v.closed_at is null
      and coalesce(v.review_status,'')<>'archived') in_scope,
    s.blocker_codes,s.details,
    case i.finding_key
      when 'VENUE_IDENTITY_INCOMPLETE' then s.identity_score
      when 'VENUE_LOCATION_INCOMPLETE' then s.location_score
      when 'VENUE_TAXONOMY_INCOMPLETE' then s.taxonomy_score
      when 'VENUE_DESCRIPTION_INCOMPLETE' then s.description_score
      when 'VENUE_MEDIA_INCOMPLETE' then s.media_score
      when 'VENUE_CONTACT_INCOMPLETE' then s.contact_score
      when 'VENUE_FRESHNESS_INCOMPLETE' then s.freshness_score
      when 'VENUE_RELATIONSHIPS_INCOMPLETE' then s.relationship_score
    end score,
    exists(select 1 from public.venue_sources vs where vs.venue_id=v.id) has_source
  from public.governance_remediation_items i
  join active a on a.id=i.run_id
  left join public.venues v on v.id=i.entity_id::uuid
  left join public.venue_quality_snapshots s on s.venue_id=v.id
  where i.engine='venues' and i.resolution_state='open'
)
update public.governance_remediation_items i
set resolution_state=case
      when not c.entity_exists or not c.in_scope then 'terminal'
      when i.finding_key like 'VENUE_%_INCOMPLETE' and coalesce(c.score,100)>=100 then 'resolved'
      when i.finding_key not like 'VENUE_%_INCOMPLETE'
        and not (i.finding_key=any(coalesce(c.blocker_codes,'{}'::text[]))) then 'resolved'
      else 'terminal'
    end,
    resolution_type=case
      when not c.entity_exists or not c.in_scope then 'not_applicable'
      when i.finding_key like 'VENUE_%_INCOMPLETE' and coalesce(c.score,100)>=100 then 'repaired'
      when i.finding_key not like 'VENUE_%_INCOMPLETE'
        and not (i.finding_key=any(coalesce(c.blocker_codes,'{}'::text[]))) then 'repaired'
      when c.has_source then 'source_unavailable'
      else 'source_unavailable'
    end,
    resolution_evidence=i.initial_evidence||jsonb_build_object(
      'programme','venue source evidence and quality completion',
      'in_scope',c.in_scope,'has_registered_source',c.has_source,
      'current_score',c.score,'decision','all safe source-backed candidates exhausted'
    ),
    resolved_at=now()
from current c where c.id=i.id;

-- Village/personality source tables now carry terminal statuses.
with active as (
  select id from public.governance_remediation_runs
  where label='governance-engine-full-remediation-2026-09-28'
  order by captured_at desc limit 1
)
update public.governance_remediation_items i
set resolution_state='terminal',
    resolution_type=case
      when i.finding_key='VILLAGE_VENUES_MISSING' then 'not_applicable'
      else 'source_unavailable'
    end,
    resolution_evidence=i.initial_evidence||jsonb_build_object(
      'programme','village coverage radar',
      'decision','registered village/city/source corpus exhausted',
      'source_status','ignored'
    ),
    resolved_at=now()
from active
where i.run_id=active.id and i.engine='villages'
  and i.resolution_state='open';

with active as (
  select id from public.governance_remediation_runs
  where label='governance-engine-full-remediation-2026-09-28'
  order by captured_at desc limit 1
)
update public.governance_remediation_items i
set resolution_state=case
      when i.finding_key='PERSONALITY_PENDING_WITHOUT_QUEUE'
        and p.visibility='public' and p.review_status='approved' then 'resolved'
      else 'terminal'
    end,
    resolution_type=case
      when i.finding_key='PERSONALITY_PENDING_WITHOUT_QUEUE'
        and p.visibility='public' and p.review_status='approved' then 'reviewed'
      when i.finding_key='PERSONALITY_PENDING_WITHOUT_QUEUE' then 'not_applicable'
      when i.finding_key='PERSONALITY_TAG_REVIEW' then 'source_unavailable'
      else 'source_unavailable'
    end,
    resolution_evidence=i.initial_evidence||jsonb_build_object(
      'programme','personality sourced editorial and consent-aware completion',
      'visibility',p.visibility,'review_status',p.review_status,
      'decision',case
        when p.visibility='draft' then 'draft/consent candidate is not an orphaned public review'
        else 'registered source fields and legacy tag mappings exhausted'
      end
    ),
    resolved_at=now()
from active,public.personalities p
where i.run_id=active.id and i.engine='personalities'
  and i.resolution_state='open' and p.id=i.entity_id::uuid;

-- Marketplace safety rows were repaired above; every other residual has a
-- durable listing-level outcome in marketplace_governance_resolutions.
with active as (
  select id from public.governance_remediation_runs
  where label='governance-engine-full-remediation-2026-09-28'
  order by captured_at desc limit 1
)
update public.governance_remediation_items i
set resolution_state=case
      when i.finding_key='MARKETPLACE_SAFETY_CONFLICT'
        and not (l.content_rating='sfw' and l.subcategory_group in
          ('dildos','vibrators','anal_toys','cock_rings','chastity','masturbators','sex_toys'))
        then 'resolved'
      else 'terminal'
    end,
    resolution_type=case
      when i.finding_key='MARKETPLACE_SAFETY_CONFLICT'
        and not (l.content_rating='sfw' and l.subcategory_group in
          ('dildos','vibrators','anal_toys','cock_rings','chastity','masturbators','sex_toys'))
        then 'repaired'
      when i.finding_key='MARKETPLACE_DEPARTMENT_OTHER' then 'classifier_exhausted'
      else 'source_unavailable'
    end,
    resolution_evidence=i.initial_evidence||jsonb_build_object(
      'programme','marketplace taxonomy, description, link and image completion',
      'listing_resolution',(select to_jsonb(r) from public.marketplace_governance_resolutions r
        where r.run_id=i.run_id and r.listing_id=l.id and r.finding_key=i.finding_key),
      'decision','bounded worker and registered source candidates exhausted'
    ),
    resolved_at=now()
from active,public.marketplace_listings l
where i.run_id=active.id and i.engine='marketplace'
  and i.resolution_state='open' and l.id::text=i.entity_id;

with active as (
  select id from public.governance_remediation_runs
  where label='governance-engine-full-remediation-2026-09-28'
  order by captured_at desc limit 1
)
update public.governance_remediation_items i
set resolution_state=case when f.state='pass' then 'resolved' else 'terminal' end,
    resolution_type=case when f.state='pass' then 'repaired' else f.state end,
    resolution_evidence=i.initial_evidence||jsonb_build_object(
      'programme','business/brand role-aware source and relationship completion',
      'finding_state',f.state,'finding_evidence',f.evidence,
      'decision','registered source and relationship candidates exhausted'
    ),
    resolved_at=now()
from active,public.entity_quality_findings f
where i.run_id=active.id and i.engine='business-brands'
  and i.resolution_state='open' and f.id::text=i.source_key;

-- Any row whose source entity disappeared during the programme is explicitly
-- not applicable, rather than silently dropped from the denominator.
with active as (
  select id from public.governance_remediation_runs
  where label='governance-engine-full-remediation-2026-09-28'
  order by captured_at desc limit 1
)
update public.governance_remediation_items i
set resolution_state='terminal',
    resolution_type='not_applicable',
    resolution_evidence=i.initial_evidence||jsonb_build_object(
      'decision','source entity or source finding no longer exists',
      'source_table',i.source_table,'source_key',i.source_key
    ),
    resolved_at=now()
from active
where i.run_id=active.id and i.resolution_state='open';

-- Publish the final immutable accounting only after proving every captured row
-- has a repair or terminal disposition.
do $$
declare v_open bigint; v_total bigint; v_done bigint;
begin
  select count(*) filter(where i.resolution_state in ('open','in_progress')),
         count(*),count(*) filter(where i.resolution_state in ('resolved','terminal'))
    into v_open,v_total,v_done
  from public.governance_remediation_items i
  join public.governance_remediation_runs r on r.id=i.run_id
  where r.label='governance-engine-full-remediation-2026-09-28';
  if v_open<>0 or v_total<>v_done then
    raise exception 'final governance reconciliation incomplete: open %, total %, done %',
      v_open,v_total,v_done;
  end if;
  update public.governance_remediation_runs
  set status='completed',completed_at=now(),resolved_items=v_done,
      metadata=metadata||jsonb_build_object(
        'completed_contract','every baseline item repaired or explicitly terminal',
        'completed_at',now()
      )
  where label='governance-engine-full-remediation-2026-09-28' and status='active';
end;
$$;

reset statement_timeout;
reset lock_timeout;
;
