-- Internal integration regression. Fixtures and all repair side effects roll back.
begin;
do $test$
declare inactive uuid:=gen_random_uuid(); published uuid:=gen_random_uuid();
 stocked uuid:=gen_random_uuid(); waived uuid:=gen_random_uuid();
 label text:='review-scope-regression-'||gen_random_uuid(); result jsonb; before_brand jsonb;
begin
 insert into public.marketplace_brands(id,brand_key,display_name,publication_status,product_count)
 values(inactive,label||'-inactive','Scope regression inactive','draft',0),
 (published,label||'-published','Scope regression published','published',0),
 (stocked,label||'-stocked','Scope regression stocked','draft',1),
 (waived,label||'-waived','Scope regression waived','draft',0);
 insert into public.entity_quality_findings(entity_type,entity_id,dimension,state,reason_code,evidence,waived_at)
 select 'marketplace_brand',id,'editorial','fail','story_missing_or_thin',
  '{"fixture":true}'::jsonb,case when id=waived then now() end
 from public.marketplace_brands where id in(inactive,published,stocked,waived);
 select to_jsonb(b)-'quality_dimensions'-'quality_checked_at' into before_brand
 from public.marketplace_brands b where id=inactive;
 result:=api_private.reconcile_inactive_brand_quality(0,false);
 if (result->>'findings_reconciled')::int<>0 then raise exception 'Zero batch mutated rows';end if;
 perform api_private.reconcile_inactive_brand_quality(200,null);
 if not exists(select from public.entity_quality_findings where entity_id=inactive and state='fail') then
  raise exception 'NULL dry run mutated findings';end if;
 perform api_private.reconcile_inactive_brand_quality(200,false);
 if not exists(select from public.entity_quality_findings where entity_id=inactive
  and state='not_applicable' and reason_code='brand_outside_quality_scope'
  and waived_at is null and evidence->>'fixture'='true') then
  raise exception 'Inactive finding not reconciled or evidence/waiver changed';end if;
 if exists(select from public.entity_quality_findings where entity_id in(published,stocked,waived) and state<>'fail') then
  raise exception 'Published, stocked or waived brand findings were changed';end if;
 if before_brand is distinct from(select to_jsonb(b)-'quality_dimensions'-'quality_checked_at'
  from public.marketplace_brands b where id=inactive) then raise exception 'Brand profile changed';end if;
 if not exists(select from public.business_brand_quality_events where entity_id=inactive
  and reason_code='brand_outside_quality_scope' and previous_value->>'state'='fail'
  and new_value->>'human_reviewed'='false') then raise exception 'Machine audit missing';end if;
 -- A brand reentering scope must not be retired again.
 update public.marketplace_brands set product_count=1 where id=inactive;
 update public.entity_quality_findings set state='fail',reason_code='story_missing_or_thin' where entity_id=inactive;
 perform api_private.reconcile_inactive_brand_quality(200,false);
 if not exists(select from public.entity_quality_findings where entity_id=inactive and state='fail') then
  raise exception 'Reactivated brand was retired';end if;
 if position('or a.n>0' in pg_get_functiondef('public.refresh_business_brand_quality()'::regprocedure))=0 then
  raise exception 'Actual active products missing from producer scope';end if;
end $test$;
select 'Dry run, bounds, scope exclusions, evidence, profile preservation, audit and reentry passed' result;
rollback;
