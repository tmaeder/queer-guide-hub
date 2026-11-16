-- Recovered from production migration history. Already applied; do not renumber.
-- Recorded statement digest (MD5): 55c3db7b73dddeb4498ecd0a3768d755
-- A draft brand with neither stored nor actual active products is outside the
-- existing quality producer's scope. Retire stale findings without waiving them
-- or changing ownership/publication decisions. The producer rechecks on reentry.
create or replace function api_private.reconcile_inactive_brand_quality(
 p_batch integer default 100,p_dry_run boolean default true
) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare r record; n integer; brands integer:=0; findings integer:=0;
begin
 perform public.assert_admin_or_internal();
 if not pg_try_advisory_xact_lock(hashtext('business_quality_lifecycle')) then
  return jsonb_build_object('skipped',true,'reason','already_running');end if;
 for r in
  select b.id from public.marketplace_brands b
  where b.product_count=0 and b.publication_status<>'published'
   and not exists(select from public.marketplace_listings l where l.brand_key=b.brand_key
    and l.status='active' and l.duplicate_of_id is null)
   and exists(select from public.entity_quality_findings f where f.entity_type='marketplace_brand'
    and f.entity_id=b.id and f.state in('fail','pending') and f.waived_at is null)
   and not exists(select from public.admin_review_cases c where c.active
    and c.item->>'entity_id'=b.id::text and c.item->>'content_type'='marketplace_brand'
    and (exists(select from public.admin_review_automation_jobs j where j.case_id=c.id
      and j.status='running' and j.lease_expires_at>now())
     or exists(select from public.admin_review_research_jobs j where j.case_id=c.id
      and j.status='running' and j.lease_expires_at>now())
     or exists(select from api_private.review_source_verification_leases l where l.case_id=c.id
      and l.lease_expires_at>now())))
  order by b.id limit greatest(0,least(coalesce(p_batch,100),200))
  for update of b skip locked
 loop
  brands:=brands+1;
  if p_dry_run is distinct from false then
   select count(*) into n from public.entity_quality_findings f
    where f.entity_type='marketplace_brand' and f.entity_id=r.id
     and f.state in('fail','pending') and f.waived_at is null;
  else
   with locked as materialized (
    select f.* from public.entity_quality_findings f
    where f.entity_type='marketplace_brand' and f.entity_id=r.id
     and f.state in('fail','pending') and f.waived_at is null for update skip locked
   ), audited as (
    insert into public.business_brand_quality_events(entity_type,entity_id,dimension,previous_value,new_value,reason_code)
    select entity_type,entity_id,dimension,to_jsonb(locked),
     jsonb_build_object('state','not_applicable','human_reviewed',false),
     'brand_outside_quality_scope' from locked returning entity_id,dimension
   ) update public.entity_quality_findings f
    set state='not_applicable',reason_code='brand_outside_quality_scope',checked_at=now(),
     evidence=f.evidence||jsonb_build_object('lifecycle',jsonb_build_object(
      'reason','brand_outside_quality_scope','stored_products',0,'active_products',0,
      'human_reviewed',false,'assessed_at',now()))
    from audited a where f.entity_type='marketplace_brand' and f.entity_id=a.entity_id and f.dimension=a.dimension;
   get diagnostics n=row_count;
   update public.marketplace_brands b set quality_dimensions=d.dimensions
   from(select jsonb_object_agg(dimension,jsonb_build_object('state',state,
    'reason_code',reason_code,'waived',waived_at is not null)) dimensions
    from public.entity_quality_findings where entity_type='marketplace_brand' and entity_id=r.id)d
   where b.id=r.id;
  end if;
  findings:=findings+n;
 end loop;
 return jsonb_build_object('dry_run',p_dry_run is distinct from false,
  'brands_examined',brands,'findings_reconciled',findings);
end $fn$;
revoke all on function api_private.reconcile_inactive_brand_quality(integer,boolean) from public,anon,authenticated;

do $migration$
declare src text; anchor text:='  perform public.reconcile_superseded_business_findings(500,false);';
 scope text:=$scope$where b.product_count>0 or b.publication_status='published'$scope$;
begin
 src:=pg_get_functiondef('public.refresh_business_brand_quality()'::regprocedure);
 if position('reconcile_inactive_brand_quality' in src)>0 then return;end if;
 if position(anchor in src)=0 or position(scope in src)=0 then
  raise exception 'Brand quality producer changed; inspect before patching';end if;
 src:=replace(src,anchor,anchor||E'\n  perform api_private.reconcile_inactive_brand_quality(200,false);');
 -- A lagging zero counter must not hide a brand that has actual active products.
 src:=replace(src,scope,scope||' or a.n>0');
 execute src;
end $migration$;
;

