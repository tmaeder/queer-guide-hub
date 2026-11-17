\set ON_ERROR_STOP on
begin;
-- A mostly-live catalogue must not drive duplicate-finding lookup.
insert into organizations(id,name)select md5('live-'||n)::uuid,'Live '||n from generate_series(1,60000)n;
insert into entity_quality_findings(entity_type,entity_id,dimension,state,reason_code)
 select 'organization',id,d,'fail','missing' from organizations cross join unnest(array['contact','editorial'])d;
analyze organizations;analyze entity_quality_findings;
set local statement_timeout='5s';
set local plan_cache_mode='force_generic_plan';
do $test$
declare r jsonb;
begin
 r:=reconcile_superseded_business_findings(500,true);
 if (r->>'organizations_examined')::int<>0 then raise exception 'Live catalogue selected: %',r;end if;
 if exists(select 1 from business_brand_quality_events)then raise exception 'Empty dry run wrote audits';end if;
 if exists(select 1 from original_contract b join pg_proc p on p.oid='reconcile_superseded_business_findings(integer,boolean)'::regprocedure
   where b.proacl is distinct from p.proacl or b.proconfig is distinct from p.proconfig
    or b.proowner is distinct from p.proowner or b.prosecdef is distinct from p.prosecdef)then raise exception 'Function contract changed';end if;
 if has_function_privilege('anon','reconcile_superseded_business_findings(integer,boolean)','EXECUTE')
  or has_function_privilege('authenticated','reconcile_superseded_business_findings(integer,boolean)','EXECUTE')
  or not has_function_privilege('service_role','reconcile_superseded_business_findings(integer,boolean)','EXECUTE')then raise exception 'RPC grants changed';end if;
 perform set_config('test.allow_internal','false',true);
 begin
  perform reconcile_superseded_business_findings(1,true);
  raise exception 'Internal guard bypassed';
 exception when insufficient_privilege then null;
 end;
 perform set_config('test.allow_internal','true',true);
end $test$;
reset statement_timeout;
insert into organizations(id,name,duplicate_of_id)
 select md5('duplicate-'||n)::uuid,'Duplicate '||n,md5('live-1')::uuid from generate_series(1,2105)n;
insert into entity_quality_findings(entity_type,entity_id,dimension,state,reason_code)
 select 'organization',id,'contact','pending','missing' from organizations where duplicate_of_id is not null;
create temporary table live_before on commit drop as select id,to_jsonb(o)value from organizations o where duplicate_of_id is null;
create temporary table finding_before on commit drop as select id,to_jsonb(f)value from entity_quality_findings f
 where entity_id in(select id from organizations where duplicate_of_id is null);
analyze organizations;analyze entity_quality_findings;
set local statement_timeout='5s';
do $test$
declare r jsonb;expected uuid;
begin
 r:=reconcile_superseded_business_findings(0,false);
 if (r->>'organizations_examined')::int<>0 then raise exception 'Zero batch: %',r;end if;
 r:=reconcile_superseded_business_findings(-3,false);
 if (r->>'organizations_examined')::int<>0 then raise exception 'Negative batch: %',r;end if;
 r:=reconcile_superseded_business_findings(null,true);
 if (r->>'organizations_examined')::int<>500 then raise exception 'Default batch: %',r;end if;
 r:=reconcile_superseded_business_findings(10000,true);
 if (r->>'organizations_examined')::int<>2000 then raise exception 'Batch cap: %',r;end if;
 select id into expected from organizations where duplicate_of_id is not null order by id limit 1;
 r:=reconcile_superseded_business_findings(1,false);
 if (r->>'organizations_examined')::int<>1 or (r->>'findings_reconciled')::int<>1 then raise exception 'Write batch: %',r;end if;
 if not exists(select 1 from entity_quality_findings where entity_id=expected and state='not_applicable'
  and reason_code='organization_superseded')then raise exception 'Deterministic order changed';end if;
 if (select count(*)from business_brand_quality_events)<>1 then raise exception 'Audit cardinality';end if;
end $test$;
-- Full-catalogue JSON comparisons are verification work, not RPC runtime.
reset statement_timeout;
do $preservation$
begin
 if exists(select 1 from live_before b join organizations o using(id)where b.value is distinct from to_jsonb(o))then raise exception 'Canonical profile changed';end if;
 if exists(select 1 from finding_before b join entity_quality_findings f using(id)where b.value is distinct from to_jsonb(f))then raise exception 'Canonical finding changed';end if;
 raise notice 'bounded superseded quality: scale, grants, guard, bounds, generic plan, order, audit and preservation passed';
end $preservation$;
rollback;
