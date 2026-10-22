-- Retire only gate-generated review questions already decided by their native
-- staging record. Never approve staging or touch manual/merge/safety questions.
create function public.reconcile_staging_gate_reviews(p_staging_id uuid default null,p_batch integer default 500,p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer;
begin
 perform public.assert_admin_or_internal();
 with eligible as materialized (
  select r.id,r.status previous_status,s.review_status,s.disposition,
   case when s.review_status='rejected' or s.disposition='rejected' then 'rejected' else 'resolved' end outcome
  from public.review_queue r join public.ingestion_staging s on s.id=r.entity_id
  where r.entity_type='ingestion_staging' and r.status in ('pending','open','pending_review','review')
   and r.details->>'source'='pipeline-review-gate' and r.resolved_by is null
   and r.review_type in ('awaiting_llm_verdict','llm_needs_review','auto_publish_blocked','low_confidence','low_source_reliability')
   and coalesce(r.details->>'hard_blocker','false')<>'true'
   and coalesce(r.details->>'requires_confirm','false')<>'true'
   and coalesce(r.details->>'force_review','false')<>'true'
   and (p_staging_id is null or s.id=p_staging_id)
   and (s.review_status in ('approved','rejected') or s.disposition in ('committed','updated','rejected','duplicate'))
  order by r.id limit greatest(0,least(coalesce(p_batch,500),2000)) for update of r skip locked
 ), changed as (
  update public.review_queue r set status=e.outcome,resolved_at=now(),
   details=r.details||jsonb_build_object('native_gate_resolution',jsonb_build_object(
    'source','staging_gate_review_outcomes','previous_status',e.previous_status,
    'review_status',e.review_status,'disposition',e.disposition,'resolved_at',now(),'human_reviewed',false))
  from eligible e where r.id=e.id and not p_dry_run returning r.id
 ) select case when p_dry_run then (select count(*) from eligible) else (select count(*) from changed) end into n;
 return jsonb_build_object('dry_run',p_dry_run,'reviews_reconciled',n);
end $$;
revoke all on function public.reconcile_staging_gate_reviews(uuid,integer,boolean) from public,anon,authenticated;
grant execute on function public.reconcile_staging_gate_reviews(uuid,integer,boolean) to service_role;

create function public.sync_staging_gate_review_outcome()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.review_status in ('approved','rejected') or new.disposition in ('committed','updated','rejected','duplicate') then
  perform public.reconcile_staging_gate_reviews(new.id,500,false);
 end if;
 return new;
end $$;
revoke all on function public.sync_staging_gate_review_outcome() from public,anon,authenticated;
create trigger sync_staging_gate_review_outcome after update of review_status,disposition on public.ingestion_staging
for each row when (old.review_status is distinct from new.review_status or old.disposition is distinct from new.disposition)
execute function public.sync_staging_gate_review_outcome();
