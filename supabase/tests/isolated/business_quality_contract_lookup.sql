-- Unrelated pending work must not force a full queue scan for an entity lookup.
insert into review_queue(entity_type,entity_id,status)
 select case when n%2=0 then 'venue'else 'organization'end,gen_random_uuid(),'pending'from generate_series(1,10001)n;
analyze review_queue;
do $plan$
declare p jsonb;
begin
 execute $$explain(format json)select 1 from review_queue where entity_type='organization'and entity_id='00000000-0000-0000-0000-000000000003'and status='pending'$$into p;
 assert p::text like '%review_queue_pending_entity_lookup_idx%','Pending entity lookup did not use its bounded index';
end $plan$;

-- Instrument the real assessment's stable contract functions, preserving every
-- returned contract. The archive reconciler was exercised above; omit that hook
-- here so this assertion isolates the assessment stage's evaluation count.
do $assessment$
declare src text;
begin
 src:=pg_get_functiondef('public.refresh_business_brand_quality()'::regprocedure);
 src:=replace(src,'  if auth.uid()is null then perform public.reconcile_archived_business_completeness(100,false);end if;','');
 execute src;
end $assessment$;
create sequence fixture_source_contract_calls;
create sequence fixture_archive_contract_calls;
alter function organization_facts_only_source(uuid)rename to fixture_actual_source_contract;
alter function archived_business_completeness_scope(uuid)rename to fixture_actual_archive_contract;
create function organization_facts_only_source(p_id uuid)returns jsonb language plpgsql stable as $$
begin perform nextval('fixture_source_contract_calls');return fixture_actual_source_contract(p_id);end $$;
create function archived_business_completeness_scope(p_id uuid)returns jsonb language plpgsql stable as $$
begin perform nextval('fixture_archive_contract_calls');return fixture_actual_archive_contract(p_id);end $$;
discard plans;
do $calls$
declare before_rows jsonb;after_rows jsonb;expected_archives int;
begin
 select jsonb_agg(to_jsonb(f)-array['checked_at','id']order by entity_id,dimension)into before_rows from entity_quality_findings f;
 select count(*)into expected_archives from organizations where status='archived'and id in(select o from fixture where n in(1,2,20));
 perform refresh_business_brand_quality();
 assert(select last_value from fixture_source_contract_calls)=3,'Source contract evaluated more than once per profile';
 assert(select last_value from fixture_archive_contract_calls)=expected_archives,'Archive contract evaluated more than once per archived profile';
 select jsonb_agg(to_jsonb(f)-array['checked_at','id']order by entity_id,dimension)into after_rows from entity_quality_findings f;
 assert before_rows=after_rows,'Materialization changed finding outcomes or evidence';
end $calls$;
