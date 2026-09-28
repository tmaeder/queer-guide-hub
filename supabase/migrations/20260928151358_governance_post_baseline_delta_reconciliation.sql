-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20260928151358 with no repo file — the signature of
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
-- Reconcile findings created after the immutable baseline closed. Keep them in
-- a second immutable run so the original 490,278-item denominator never moves.
set lock_timeout='15s';
set statement_timeout='300s';

insert into public.governance_remediation_runs(label,metadata)
select 'governance-engine-post-baseline-delta-2026-09-28',
  jsonb_build_object('contract','post-baseline findings repaired or explicitly terminal')
where not exists (
  select 1 from public.governance_remediation_runs
  where label='governance-engine-post-baseline-delta-2026-09-28'
);

with active as (
  select id from public.governance_remediation_runs
  where label='governance-engine-post-baseline-delta-2026-09-28'
  order by captured_at desc limit 1
)
insert into public.governance_remediation_items(
  run_id,engine,entity_type,entity_id,finding_key,source_table,source_key,initial_evidence
)
select active.id,'events','event',i.event_id::text,'IMAGE_REUSED',
  'event_quality_issues',i.id::text,
  jsonb_build_object('issue_id',i.id,'title',e.title,'images',e.images,'evidence',i.evidence)
from active
join public.event_quality_issues i on i.status='open' and i.issue_code='IMAGE_REUSED'
join public.events e on e.id=i.event_id
on conflict do nothing;

with active as (
  select id from public.governance_remediation_runs
  where label='governance-engine-post-baseline-delta-2026-09-28'
  order by captured_at desc limit 1
)
insert into public.governance_remediation_items(
  run_id,engine,entity_type,entity_id,finding_key,source_table,source_key,initial_evidence
)
select active.id,'personalities','personality',p.id::text,
  'PERSONALITY_PENDING_WITHOUT_QUEUE','personalities',
  p.id::text||':pending-without-queue',
  jsonb_build_object('name',p.name,'visibility',p.visibility,
    'review_status',p.review_status,'publication_failures',public.personality_publication_failures(p.id))
from active
join public.personalities p on p.duplicate_of_id is null
  and p.visibility='public' and p.review_status='pending'
where not exists(select 1 from public.personality_review_queue q
    where q.personality_id=p.id and q.status='open')
  and not exists(select 1 from public.personality_tag_review_queue q
    where q.personality_id=p.id and q.status='open')
on conflict do nothing;

update public.governance_remediation_runs r
set initial_items=(select count(*) from public.governance_remediation_items i where i.run_id=r.id)
where r.label='governance-engine-post-baseline-delta-2026-09-28';

-- The ten recreated event findings are completed events carrying one generic,
-- heavily reused asset. Remove both synchronized sources of truth.
with affected as (
  select distinct i.event_id
  from public.event_quality_issues i
  where i.status='open' and i.issue_code='IMAGE_REUSED'
)
delete from public.image_asset_links l
using affected a
where l.entity_type='event' and l.entity_id=a.event_id;

update public.events e
set images='{}'::text[]
where exists (
  select 1 from public.event_quality_issues i
  where i.event_id=e.id and i.status='open' and i.issue_code='IMAGE_REUSED'
);

update public.event_quality_issues
set status='resolved',resolved_at=now(),reviewed_at=now(),
    resolution='Removed generic cross-event asset and synchronizer links; no event-specific source image exists.'
where status='open' and issue_code='IMAGE_REUSED';

-- Preserve the honest no-image result as an accepted terminal decision. A
-- future source-specific image changes the evidence hash and can reopen it.
insert into public.event_quality_issues(
  event_id,dimension,issue_code,detector,severity,status,evidence,evidence_hash,
  detected_at,last_seen_at,resolved_at,resolution,reviewed_at
)
select i.entity_id::uuid,f.dimension,f.issue_code,'governance-remediation',
  f.severity,'accepted',f.evidence,md5(f.evidence::text),now(),now(),now(),
  'Source unavailable after registered event-image candidates were exhausted.',now()
from public.governance_remediation_items i
cross join lateral public.event_quality_findings(i.entity_id::uuid) f
where i.run_id=(select id from public.governance_remediation_runs
    where label='governance-engine-post-baseline-delta-2026-09-28'
    order by captured_at desc limit 1)
  and i.finding_key='IMAGE_REUSED' and f.issue_code='IMAGE_MISSING'
  and not exists (
    select 1 from public.event_quality_issues q
    where q.event_id=i.entity_id::uuid and q.issue_code='IMAGE_MISSING'
      and q.status='accepted' and q.evidence_hash=md5(f.evidence::text)
  );

update public.event_quality_current q
set open_issue_codes=array_remove(q.open_issue_codes,'IMAGE_REUSED'),assessed_at=now()
where exists (
  select 1 from public.governance_remediation_items i
  where i.run_id=(select id from public.governance_remediation_runs
      where label='governance-engine-post-baseline-delta-2026-09-28'
      order by captured_at desc limit 1)
    and i.finding_key='IMAGE_REUSED' and i.entity_id=q.event_id::text
);

-- The legacy tag decisions are now closed, so these public records genuinely
-- have no publication failures or queues and can be approved.
update public.personalities p
set review_status='approved'
where p.duplicate_of_id is null and p.visibility='public' and p.review_status='pending'
  and cardinality(public.personality_publication_failures(p.id))=0
  and not exists(select 1 from public.personality_review_queue q
    where q.personality_id=p.id and q.status='open')
  and not exists(select 1 from public.personality_tag_review_queue q
    where q.personality_id=p.id and q.status='open');

with active as (
  select id from public.governance_remediation_runs
  where label='governance-engine-post-baseline-delta-2026-09-28'
  order by captured_at desc limit 1
)
update public.governance_remediation_items i
set resolution_state='resolved',resolution_type=case
      when i.engine='events' then 'repaired' else 'reviewed' end,
    resolution_evidence=i.initial_evidence||jsonb_build_object(
      'decision',case when i.engine='events'
        then 'generic asset removed; missing source explicitly accepted'
        else 'publication gates passed after legacy tag queue closure' end),
    resolved_at=now()
from active
where i.run_id=active.id and i.resolution_state='open';

update public.governance_remediation_runs r
set status='completed',completed_at=now(),
    resolved_items=(select count(*) from public.governance_remediation_items i
      where i.run_id=r.id and i.resolution_state in ('resolved','terminal'))
where r.label='governance-engine-post-baseline-delta-2026-09-28';

-- The dashboard summarizes the complete campaign (baseline plus deltas), not
-- whichever individual run happened most recently.
create or replace function public.latest_governance_remediation_summary()
returns jsonb
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  with campaign_runs as (
    select * from public.governance_remediation_runs
    where label in (
      'governance-engine-full-remediation-2026-09-28',
      'governance-engine-post-baseline-delta-2026-09-28'
    )
  ), campaign_items as (
    select i.* from public.governance_remediation_items i
    join campaign_runs r on r.id=i.run_id
  ), totals as (
    select count(*) filter(where resolution_state in ('open','in_progress')) open_items,
      count(*) filter(where resolution_state in ('resolved','terminal')) done_items,
      count(*) total_items
    from campaign_items
  )
  select case
    when public.has_role_jwt('admin'::public.app_role)
      or coalesce(auth.jwt()->>'role','')='service_role'
    then jsonb_build_object(
      'run',jsonb_build_object(
        'id',(select id from campaign_runs order by captured_at desc limit 1),
        'label','governance-engine-remediation-campaign-2026-09-28',
        'status',case when (select open_items from totals)=0 then 'completed' else 'active' end,
        'captured_at',(select min(captured_at) from campaign_runs),
        'completed_at',(select max(completed_at) from campaign_runs),
        'initial_items',(select total_items from totals),
        'resolved_items',(select done_items from totals)
      ),
      'by_engine',(select coalesce(jsonb_agg(to_jsonb(x) order by engine,resolution_state),'[]'::jsonb)
        from (select engine,resolution_state,count(*) items
          from campaign_items group by engine,resolution_state) x),
      'open_by_finding',(select coalesce(jsonb_agg(to_jsonb(x) order by items desc,finding_key),'[]'::jsonb)
        from (select finding_key,count(*) items from campaign_items
          where resolution_state in ('open','in_progress') group by finding_key) x)
    )
    else null
  end;
$$;

do $$
declare v_open bigint; v_event bigint; v_personality bigint;
begin
  select count(*) into v_open
  from public.governance_remediation_items i
  join public.governance_remediation_runs r on r.id=i.run_id
  where r.label='governance-engine-post-baseline-delta-2026-09-28'
    and i.resolution_state in ('open','in_progress');
  select count(*) into v_event from public.event_quality_issues
    where status='open' and issue_code='IMAGE_REUSED';
  select count(*) into v_personality from public.personalities p
    where p.duplicate_of_id is null and p.visibility='public' and p.review_status='pending'
      and not exists(select 1 from public.personality_review_queue q
        where q.personality_id=p.id and q.status='open')
      and not exists(select 1 from public.personality_tag_review_queue q
        where q.personality_id=p.id and q.status='open');
  if v_open<>0 or v_event<>0 or v_personality<>0 then
    raise exception 'post-baseline reconciliation incomplete: ledger %, reused images %, orphaned personalities %',
      v_open,v_event,v_personality;
  end if;
end;
$$;

reset statement_timeout;
reset lock_timeout;
;
