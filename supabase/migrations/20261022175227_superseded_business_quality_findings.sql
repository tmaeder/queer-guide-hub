-- Superseded identities have no independent completeness work to perform.
-- Keep canonical findings, waivers, content, verification and scores untouched.
create function public.reconcile_superseded_business_findings(p_batch integer default 500,p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r record; canonical uuid; organizations_examined integer:=0; changed integer:=0; n integer;
begin
 perform public.assert_admin_or_internal();
 if not pg_try_advisory_xact_lock(hashtext('superseded_business_findings')) then
  return jsonb_build_object('skipped',true,'reason','already_running'); end if;
 for r in
  select o.id from public.organizations o join public.organizations c on c.id=o.duplicate_of_id
  where c.duplicate_of_id is null and c.id<>o.id
   and exists(select 1 from public.entity_quality_findings f where f.entity_type='organization' and f.entity_id=o.id
    and f.state in ('fail','pending') and f.waived_at is null)
  order by o.id limit greatest(0,least(coalesce(p_batch,500),2000))
 loop
  perform 1 from public.organizations where id=r.id for update;
  select c.id into canonical from public.organizations o join public.organizations c on c.id=o.duplicate_of_id
   where o.id=r.id and c.duplicate_of_id is null and c.id<>o.id;
  if canonical is null then continue; end if;
  if p_dry_run then
   select count(*) into n from public.entity_quality_findings f where f.entity_type='organization' and f.entity_id=r.id
    and f.state in ('fail','pending') and f.waived_at is null;
  else
   with locked as materialized (
    select f.* from public.entity_quality_findings f where f.entity_type='organization' and f.entity_id=r.id
     and f.state in ('fail','pending') and f.waived_at is null for update of f skip locked
   ), audited as (
    insert into public.business_brand_quality_events(entity_type,entity_id,dimension,previous_value,new_value,reason_code)
    select 'organization',entity_id,dimension,
     jsonb_build_object('state',state,'reason_code',reason_code,'evidence',evidence),
     jsonb_build_object('state','not_applicable','canonical_organization_id',canonical),'organization_superseded'
    from locked returning entity_id,dimension
   ), updated as (
    update public.entity_quality_findings f set state='not_applicable',reason_code='organization_superseded',checked_at=now(),
     evidence=coalesce(f.evidence,'{}'::jsonb)||jsonb_build_object('lifecycle',jsonb_build_object(
      'reason','organization_superseded','canonical_organization_id',canonical,'assessed_at',now(),'human_reviewed',false))
    from audited a where f.entity_type='organization' and f.entity_id=a.entity_id and f.dimension=a.dimension
    returning f.entity_id,f.dimension
   ), dimensions as (
    select entity_id,jsonb_object_agg(dimension,jsonb_build_object('state','not_applicable',
     'reason_code','organization_superseded','waived',false)) summary from updated group by entity_id
   ), profiles as (
    update public.organizations o set quality_dimensions=coalesce(o.quality_dimensions,'{}'::jsonb)||d.summary
    from dimensions d where o.id=d.entity_id returning o.id
   ) select count(*) into n from updated;
  end if;
  changed:=changed+n; organizations_examined:=organizations_examined+1;
 end loop;
 return jsonb_build_object('dry_run',p_dry_run,'organizations_examined',organizations_examined,'findings_reconciled',changed);
end $$;
revoke all on function public.reconcile_superseded_business_findings(integer,boolean) from public,anon,authenticated;
grant execute on function public.reconcile_superseded_business_findings(integer,boolean) to service_role;

-- The ordinary producer excludes duplicate identities, so it cannot otherwise
-- retire their older findings. Run this bounded reconciliation on each pass.
do $patch$
declare target regprocedure; src text; anchor text:='begin
  perform public.reconcile_organization_link_roles();';
begin
 target:=coalesce(to_regprocedure('api_private.refresh_business_brand_quality()'),to_regprocedure('public.refresh_business_brand_quality()'));
 select pg_get_functiondef(target) into src;
 if (length(src)-length(replace(src,anchor,'')))/length(anchor)<>1 then
  raise exception 'Business quality lifecycle anchor changed'; end if;
 execute replace(src,anchor,'begin
  perform public.reconcile_superseded_business_findings(500,false);
  perform public.reconcile_organization_link_roles();');
end $patch$;
