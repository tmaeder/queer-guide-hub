begin;
do $$
declare j public.logo_quality_jobs%rowtype; et text; lease_id uuid:=gen_random_uuid(); result text; changed integer;
begin
 if has_function_privilege('anon','public.logo_review_source_jobs(integer,integer)','execute') or
    has_function_privilege('authenticated','public.logo_review_record_findings(jsonb)','execute') or
    has_table_privilege('authenticated','api_private.logo_review_sessions','select') then
   raise exception 'review evidence/session privileges are public';
 end if;
 if public.logo_review_session_check(repeat('0',64)) then raise exception 'fabricated session accepted'; end if;
 if not exists(select 1 from api_private.jev_budget_accounts where account='logo-review-2026-11-27' and cap_nano_usd=1000000000 and period='lifetime') then
   raise exception 'approved lifetime verification budget missing';
 end if;
 select * into j from public.logo_quality_jobs where status='review' limit 1 for update;
 if not found then raise exception 'no review fixture'; end if;
 select public.logo_review_record_findings(jsonb_build_array(jsonb_build_object(
   'entity_table',j.entity_table,'entity_id',j.entity_id,'expected_url','https://example.invalid/stale-logo.png',
   'expected_website',j.expected_website,'reason','test stale snapshot','evidence','{}'::jsonb))) into changed;
 if changed<>0 then raise exception 'stale findings changed a case'; end if;
 et:=case j.entity_table when 'venues' then 'venue' when 'events' then 'event' when 'organizations' then 'organization' else 'marketplace_brand' end;
 update public.review_queue set status='resolved',resolved_at=now() where entity_type=et and entity_id=j.entity_id and review_type='logo_quality' and status in ('pending','open','pending_review','review');
 update public.logo_quality_jobs set status='processing',lease=lease_id where entity_table=j.entity_table and entity_id=j.entity_id;
 result:=public.logo_review_finish(j.entity_table,j.entity_id,lease_id,'https://example.invalid/unused.png','test','{}');
 if result<>'review_already_decided' then raise exception 'closed human decision was overwritten: %',result; end if;
end $$;
rollback;
