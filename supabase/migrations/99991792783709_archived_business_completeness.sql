-- Archived, unclaimed location spines without live content have no current
-- business completeness work. Identity, linkage and exposure checks remain.
create function public.archived_business_completeness_scope(p_id uuid)
returns jsonb language sql stable set search_path=public,pg_temp as $scope$
 select jsonb_build_object('contract','archived-location-spine:v1','outcome','not_applicable',
  'organization_id',o.id,'organization_status',o.status,'primary_venue_id',v.id,
  'venue_review_status',v.review_status,'human_reviewed',false,
  'reason','Archived unclaimed location spine without independent linked content; reassess after restoration or relationship changes.')
 from public.organizations o join public.venues v on v.id=o.primary_venue_id and v.organization_id=o.id
 where o.id=p_id and o.status='archived'and o.duplicate_of_id is null
  and o.roles=array['venue']::text[] and o.claim_status='unclaimed'
  and o.field_provenance#>>'{identity,source}'='unified_location'
  and v.review_status='archived'and v.duplicate_of_id is null and v.needs_attention=false
  and lower(btrim(o.name))=lower(btrim(v.name))
  and o.city_id is not distinct from v.city_id and o.country_id is not distinct from v.country_id
  and not exists(select 1 from public.venues x where x.organization_id=o.id
   and x.duplicate_of_id is null and x.review_status is distinct from'archived')
  -- Retain historical/event relationships too: this contract is deliberately
  -- narrower than simply hiding every archived organization from the queue.
  and not exists(select 1 from public.events e join public.venues x on x.id=e.venue_id where x.organization_id=o.id)
  and not exists(select 1 from public.hotels x where x.organization_id=o.id)
  and not exists(select 1 from public.marketplace_merchants x where x.organization_id=o.id)
  and not exists(select 1 from public.marketplace_brands x where x.organization_id=o.id)
  and not exists(select 1 from public.affiliate_partners x where x.organization_id=o.id)
  and not exists(select 1 from public.news_sources x where x.organization_id=o.id)
  -- Provider quarantine is research work, not a terminal archive. Preserve
  -- its independent corroboration gate even if a stale attention flag cleared.
  and not exists(select 1 from public.ingestion_staging s where s.target_record_id=v.id
   and s.source_name in('foursquare','foursquare_os')
   and s.normalized_data#>>'{metadata,requires_editorial_review}'='true')
  and not exists(select 1 from public.review_queue q where q.status='pending'and(
   (q.entity_type='organization'and q.entity_id=o.id)or(q.entity_type='venue'and q.entity_id in(
    select x.id from public.venues x where x.organization_id=o.id))))
  and not exists(select 1 from public.entity_quality_findings f where f.entity_type='organization'and f.entity_id=o.id
   and(f.waived_at is not null or f.evidence?'governance_resolution'))
$scope$;
revoke all on function public.archived_business_completeness_scope(uuid)from public,anon,authenticated;
grant execute on function public.archived_business_completeness_scope(uuid)to service_role;

create function public.reconcile_archived_business_completeness(p_batch integer default 100,p_dry_run boolean default true,p_ids uuid[] default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $repair$
declare candidate record;o public.organizations;before_o jsonb;scope jsonb;finding record;dimensions jsonb;
 examined integer:=0;changed integer:=0;related integer;locked integer;ids uuid[]:='{}';
begin
 perform public.assert_admin_or_internal();
 if auth.uid()is not null then raise exception 'Internal lifecycle reconciliation only';end if;
 if coalesce(cardinality(p_ids),0)>500 then raise exception 'At most five hundred identities';end if;
 if not pg_try_advisory_xact_lock(hashtext('business_quality_lifecycle'))then
  return jsonb_build_object('skipped',true,'reason','already_running');end if;
 for candidate in select profile.id from public.organizations profile where profile.status='archived'
  and profile.duplicate_of_id is null and(p_ids is null or profile.id=any(p_ids))
  and exists(select 1 from public.entity_quality_findings f where f.entity_type='organization'and f.entity_id=profile.id
   and f.state in('fail','pending')and f.dimension in('editorial','contact','media','freshness')and f.waived_at is null)
  order by profile.id
 loop
  exit when examined>=greatest(0,least(coalesce(p_batch,100),500));
  if not coalesce(p_dry_run,true)then
   select *into o from public.organizations where id=candidate.id for update skip locked;
   if not found then continue;end if;
   select count(*)into related from public.venues where organization_id=o.id;
   perform 1 from public.venues where organization_id=o.id order by id for update skip locked;
   get diagnostics locked=row_count;if locked<>related then continue;end if;
   select count(*)into related from public.entity_quality_findings where entity_type='organization'and entity_id=o.id;
   perform 1 from public.entity_quality_findings where entity_type='organization'and entity_id=o.id order by id for update skip locked;
   get diagnostics locked=row_count;if locked<>related then continue;end if;
  else select *into o from public.organizations where id=candidate.id;end if;
  scope:=public.archived_business_completeness_scope(o.id);if scope is null then continue;end if;
  examined:=examined+1;before_o:=to_jsonb(o);dimensions:='{}';
  for finding in select f.*from public.entity_quality_findings f where f.entity_type='organization'and f.entity_id=o.id
   and f.state in('fail','pending')and f.dimension in('editorial','contact','media','freshness')and f.waived_at is null
   order by f.id
  loop
   if not coalesce(p_dry_run,true)then
    insert into public.business_brand_quality_events(entity_type,entity_id,dimension,previous_value,new_value,reason_code)
     values('organization',o.id,finding.dimension,to_jsonb(finding),
      jsonb_build_object('state','not_applicable','lifecycle_contract',scope),'archived_primary_venue');
    update public.entity_quality_findings set state='not_applicable',reason_code='archived_primary_venue',checked_at=now(),
     evidence=coalesce(evidence,'{}')||jsonb_build_object('archived_lifecycle',scope)where id=finding.id;
    dimensions:=dimensions||jsonb_build_object(finding.dimension,
     jsonb_build_object('state','not_applicable','reason_code','archived_primary_venue','waived',false));
   end if;
   changed:=changed+1;
  end loop;
  if not coalesce(p_dry_run,true)and dimensions<>'{}'::jsonb then
   update public.organizations set quality_dimensions=coalesce(quality_dimensions,'{}')||dimensions where id=o.id;
  end if;
  if not coalesce(p_dry_run,true)and exists(select 1 from public.organizations profile where profile.id=o.id
   and to_jsonb(profile)-array['quality_dimensions','updated_at']is distinct from before_o-array['quality_dimensions','updated_at'])then
   raise exception 'Unexpected archived business content change %',o.id;end if;
  ids:=array_append(ids,o.id);
 end loop;
 return jsonb_build_object('dry_run',coalesce(p_dry_run,true),'organizations_examined',examined,
  'findings_reconciled',changed,'organization_ids',to_jsonb(ids));
end $repair$;
revoke all on function public.reconcile_archived_business_completeness(integer,boolean,uuid[])from public,anon,authenticated;
grant execute on function public.reconcile_archived_business_completeness(integer,boolean,uuid[])to service_role;

-- Reassess on restoration or new relationships, using the ordinary producer's
-- native dimension assessment. Do not fabricate a missing-data verdict here.
create function public.invalidate_archived_business_completeness()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $invalidate$
declare affected uuid[];
begin
 if tg_table_name='organizations'then
  if exists(select 1 from public.entity_quality_findings f where f.entity_type='organization'and f.entity_id=new.id
   and f.state='not_applicable'and f.reason_code='archived_primary_venue')then new.quality_checked_at:=null;end if;
  return new;
 elsif tg_table_name='review_queue'then
  select array_agg(distinct case when ref.entity_type='organization'then ref.entity_id else v.organization_id end)
   into affected from(values
    (case when tg_op<>'DELETE'then new.entity_type end,case when tg_op<>'DELETE'then new.entity_id end),
    (case when tg_op<>'INSERT'then old.entity_type end,case when tg_op<>'INSERT'then old.entity_id end))ref(entity_type,entity_id)
   left join public.venues v on ref.entity_type='venue'and v.id=ref.entity_id;
 elsif tg_table_name='events'then
  select array_agg(distinct v.organization_id)into affected from public.venues v where v.id=any(array[
   case when tg_op<>'DELETE'then new.venue_id end,case when tg_op<>'INSERT'then old.venue_id end]);
 else affected:=array[case when tg_op<>'DELETE'then new.organization_id end,case when tg_op<>'INSERT'then old.organization_id end];end if;
 update public.organizations profile set quality_checked_at=null where profile.id=any(affected)and profile.quality_checked_at is not null
  and exists(select 1 from public.entity_quality_findings f where f.entity_type='organization'and f.entity_id=profile.id
   and f.state='not_applicable'and f.reason_code='archived_primary_venue');
 return coalesce(new,old);
end $invalidate$;
revoke all on function public.invalidate_archived_business_completeness()from public,anon,authenticated;
create trigger archived_business_completeness_organization before update of status,duplicate_of_id,roles,claim_status,primary_venue_id,field_provenance,name,city_id,country_id
 on public.organizations for each row when(old.status is distinct from new.status or old.duplicate_of_id is distinct from new.duplicate_of_id
 or old.roles is distinct from new.roles or old.claim_status is distinct from new.claim_status or old.primary_venue_id is distinct from new.primary_venue_id
 or old.field_provenance is distinct from new.field_provenance or old.name is distinct from new.name
 or old.city_id is distinct from new.city_id or old.country_id is distinct from new.country_id)
 execute function public.invalidate_archived_business_completeness();
create trigger archived_business_completeness_venue after insert or delete or update of review_status,needs_attention,duplicate_of_id,organization_id,name,city_id,country_id
 on public.venues for each row execute function public.invalidate_archived_business_completeness();
create trigger archived_business_completeness_event after insert or delete or update of venue_id
 on public.events for each row execute function public.invalidate_archived_business_completeness();
create trigger archived_business_completeness_review after insert or delete or update of entity_type,entity_id,status
 on public.review_queue for each row execute function public.invalidate_archived_business_completeness();
do $child_triggers$
declare relation text;
begin
 foreach relation in array array['hotels','marketplace_merchants','marketplace_brands','affiliate_partners','news_sources']loop
  execute format('create trigger archived_business_completeness_link after insert or delete or update of organization_id on public.%I for each row execute function public.invalidate_archived_business_completeness()',relation);
 end loop;
end $child_triggers$;

do $producer$
declare target regprocedure;src text;selector text:='select o.*,public.organization_facts_only_source(o.id) source_contract,';
 condition text:='case when v.state in (''fail'',''pending'') and v.dimension in (''editorial'',''contact'',''media'') and o.source_contract->''unavailable_dimensions'' ? v.dimension';
 guard text:='o.archived_contract is not null and v.state in (''fail'',''pending'') and v.dimension in (''editorial'',''contact'',''media'',''freshness'')';
 anchor text:='  perform public.reconcile_superseded_business_findings(500,false);';
begin
 target:=coalesce(to_regprocedure('api_private.refresh_business_brand_quality()'),to_regprocedure('public.refresh_business_brand_quality()'));
 src:=pg_get_functiondef(target);
 if(length(src)-length(replace(src,selector,'')))/length(selector)<>1
  or(length(src)-length(replace(src,condition,'')))/length(condition)<>3
  or(length(src)-length(replace(src,anchor,'')))/length(anchor)<>1 then raise exception 'Archived business producer anchor changed';end if;
 src:=replace(src,selector,selector||'case when o.status=''archived''then public.archived_business_completeness_scope(o.id)end archived_contract,');
 src:=replace(src,condition||E'\n        then ''source_unavailable''',
  'case when '||guard||' then ''not_applicable'' when '||substring(condition from 11)||E'\n        then ''source_unavailable''');
 src:=replace(src,condition||E'\n        then ''facts_only_source_''',
  'case when '||guard||' then ''archived_primary_venue'' when '||substring(condition from 11)||E'\n        then ''facts_only_source_''');
 src:=replace(src,condition||E'\n        then v.evidence',
  'case when '||guard||' then v.evidence||jsonb_build_object(''archived_lifecycle'',o.archived_contract) when '||substring(condition from 11)||E'\n        then v.evidence');
 if position('then ''not_applicable'' when 'in src)=0 or position('then ''archived_primary_venue'' when 'in src)=0
  or position('jsonb_build_object(''archived_lifecycle'',o.archived_contract) when 'in src)=0 then raise exception 'Archived business projection changed';end if;
 src:=regexp_replace(src,E'\nbegin\n',E'\nbegin\n  if not pg_try_advisory_xact_lock(hashtext(''business_quality_lifecycle''))then return jsonb_build_object(''skipped'',true,''reason'',''already_running'');end if;\n');
 src:=replace(src,anchor,E'  if auth.uid()is null then perform public.reconcile_archived_business_completeness(100,false);end if;\n'||anchor);
 execute src;
end $producer$;
