\set ON_ERROR_STOP on
begin;
do $test$
declare canonical uuid:=gen_random_uuid(); superseded uuid:=gen_random_uuid(); live uuid:=gen_random_uuid(); cycle uuid:=gen_random_uuid(); r jsonb;
begin
 insert into organizations(id,name) values(canonical,'Canonical'),(superseded,'Duplicate'),(live,'Live'),(cycle,'Cycle');
 update organizations set duplicate_of_id=canonical where id=superseded;
 update organizations set duplicate_of_id=cycle where id=cycle;
 insert into entity_quality_findings(entity_type,entity_id,dimension,state,reason_code,waived_at)
 values('organization',superseded,'editorial','fail','missing',null),
 ('organization',superseded,'contact','pending','missing',null),
 ('organization',superseded,'media','fail','missing',now()),
 ('organization',canonical,'editorial','fail','missing',null),
 ('organization',live,'editorial','fail','missing',null),
 ('organization',cycle,'editorial','fail','missing',null);
 r:=reconcile_superseded_business_findings(50,true);
 if (r->>'findings_reconciled')::int<>2 or exists(select 1 from business_brand_quality_events) then raise exception 'dry run %',r; end if;
 -- Verify the actual migration hook calls the reconciler through the producer.
 perform refresh_business_brand_quality();
 if (select count(*) from entity_quality_findings where entity_id=superseded and state='not_applicable')<>2 then raise exception 'outcomes'; end if;
 if (select count(*) from business_brand_quality_events where entity_id=superseded)<>2 then raise exception 'audit'; end if;
 if not exists(select 1 from entity_quality_findings where entity_id=superseded and dimension='media' and state='fail' and waived_at is not null) then raise exception 'waiver changed'; end if;
 if (select count(*) from entity_quality_findings where entity_id in (canonical,live,cycle) and state='fail')<>3 then raise exception 'canonical/live/cycle changed'; end if;
 if not exists(select 1 from organizations where id=superseded and quality_checked_at is not null and safety_gated and status='active') then raise exception 'profile flags changed'; end if;
 r:=reconcile_superseded_business_findings(50,false);
 if (r->>'findings_reconciled')::int<>0 then raise exception 'idempotency %',r; end if;
 update organizations set duplicate_of_id=null where id=superseded;
 update entity_quality_findings set state='fail',reason_code='missing' where entity_id=superseded and dimension='editorial';
 r:=reconcile_superseded_business_findings(50,false);
 if (r->>'findings_reconciled')::int<>0 then raise exception 'unmerged identity still retired'; end if;
 raise notice 'superseded business fixtures passed';
end $test$;
rollback;
