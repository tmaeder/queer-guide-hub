-- A missing canonical target is a database fact, not a source-research question.
-- Keep the rejected proposal (and its source mention), with machine-only audit.
create or replace function api_private.repair_review_proposal_integrity(
 p_batch integer default 100,p_dry_run boolean default true
) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare r record; before_row jsonb; changed integer; links integer:=0; milestones integer:=0;
begin
 perform public.assert_admin_or_internal();
 if not pg_try_advisory_xact_lock(hashtext('review_proposal_integrity')) then
  return jsonb_build_object('skipped','already_running');
 end if;
 for r in
  select q.id from public.entity_link_review q
  where q.status='pending' and q.candidate_id is null
  and not exists (
   select from public.admin_review_cases c where c.active
    and c.item->>'queue_type'='entity-links' and c.item->>'id'=q.id::text
    and (exists(select from public.admin_review_automation_jobs j where j.case_id=c.id and j.status='running' and j.lease_expires_at>now())
      or exists(select from public.admin_review_research_jobs j where j.case_id=c.id and j.status='running' and j.lease_expires_at>now())
      or exists(select from api_private.review_source_verification_leases l where l.case_id=c.id and l.lease_expires_at>now()))
  ) order by q.id limit greatest(0,least(coalesce(p_batch,100),200))
 loop
  continue when not pg_try_advisory_xact_lock(hashtextextended('entity-links:'||r.id::text,0));
  select to_jsonb(q) into before_row from public.entity_link_review q
   where q.id=r.id and q.status='pending' and q.candidate_id is null for update skip locked;
  continue when not found;
  links:=links+1;
  if p_dry_run is distinct from false then continue; end if;
  update public.entity_link_review set status='rejected',resolved_by=null,resolved_at=now()
   where id=r.id and status='pending' and candidate_id is null;
  get diagnostics changed=row_count;
  if changed<>1 then raise exception 'Link proposal changed during repair'; end if;
  insert into public.admin_review_repairs(entity_type,entity_id,reason,previous_value,next_value)
   values('entity_link_review',r.id,'missing_canonical_target',before_row,
    jsonb_build_object('status','rejected','human_reviewed',false,
     'note','Deterministic repair: no candidate_id; proposal cannot be applied. Source mention retained; no entity identity, existence, or relationship is verified.'));
 end loop;
 for r in
  select q.id from public.milestone_review_queue q
  where q.status='open' and q.field='description'
   and q.proposed_value->'issues'='["uncertainty_language"]'::jsonb
   and nullif(btrim(q.proposed_value->>'replacement'),'') is null
  and not exists (
   select from public.admin_review_cases c where c.active
    and c.item->>'queue_type'='milestone-review' and c.item->>'id'=q.id::text
    and (exists(select from public.admin_review_automation_jobs j where j.case_id=c.id and j.status='running' and j.lease_expires_at>now())
      or exists(select from public.admin_review_research_jobs j where j.case_id=c.id and j.status='running' and j.lease_expires_at>now())
      or exists(select from api_private.review_source_verification_leases l where l.case_id=c.id and l.lease_expires_at>now()))
  ) order by q.id limit greatest(0,least(coalesce(p_batch,100),200))
 loop
  continue when not pg_try_advisory_xact_lock(hashtextextended('milestone-review:'||r.id::text,0));
  select to_jsonb(q) into before_row from public.milestone_review_queue q
   where q.id=r.id and q.status='open' and q.field='description'
    and q.proposed_value->'issues'='["uncertainty_language"]'::jsonb
    and nullif(btrim(q.proposed_value->>'replacement'),'') is null for update skip locked;
  continue when not found;
  milestones:=milestones+1;
  if p_dry_run is distinct from false then continue; end if;
  update public.milestone_review_queue set status='rejected',reviewer_id=null,reviewed_at=now(),
   reviewer_note='Deterministic repair: uncertainty_language alone with no replacement is not an actionable correction. Preserve qualified prose and existing verification; no historical fact is certified.'
   where id=r.id and status='open';
  insert into public.admin_review_repairs(entity_type,entity_id,reason,previous_value,next_value)
   values('milestone_review_queue',r.id,'uncertainty_without_replacement',before_row,
    jsonb_build_object('status','rejected','human_reviewed',false,'milestone_unchanged',true));
 end loop;
 return jsonb_build_object('dry_run',p_dry_run is distinct from false,'missing_link_candidates',links,
  'uncertainty_without_replacement',milestones);
end $fn$;
revoke all on function api_private.repair_review_proposal_integrity(integer,boolean) from public,anon,authenticated;

-- Extend the existing five-minute cleanup without changing its established repairs.
do $migration$
declare definition text; declaration text:='v_evidence jsonb;';
 return_anchor text:=$anchor$ return jsonb_build_object('dry_run',p_dry_run,'product_counts',v_counts,'neutral_categories',v_neutral);$anchor$;
begin
 definition:=pg_get_functiondef('public.repair_admin_review_mechanical(integer,boolean)'::regprocedure);
 if position('repair_review_proposal_integrity' in definition)>0 then return; end if;
 if position(declaration in definition)=0 or position(return_anchor in definition)=0 then
  raise exception 'Mechanical review cleanup changed; inspect before patching';
 end if;
 definition:=replace(definition,declaration,'v_evidence jsonb; v_integrity jsonb;');
 definition:=replace(definition,return_anchor,$replacement$
 v_integrity:=api_private.repair_review_proposal_integrity(p_batch,p_dry_run);
 return jsonb_build_object('dry_run',p_dry_run,'product_counts',v_counts,'neutral_categories',v_neutral,'proposal_integrity',v_integrity);$replacement$);
 execute definition;
end $migration$;
