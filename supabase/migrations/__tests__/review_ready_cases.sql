-- Transactional regression checks; no persistent fixture rows or claimed jobs.
begin;
do $test$
declare v_id uuid:=gen_random_uuid(); v_jobs jsonb; v_lease uuid; v_result boolean;
begin
 if has_function_privilege('anon','public.get_admin_review_worklist(text[],text,text,text,integer,integer)','EXECUTE')
  or has_function_privilege('authenticated','public.claim_admin_review_research_jobs(integer)','EXECUTE')
  or has_function_privilege('authenticated','public.finish_admin_review_research_job(uuid,uuid,text,jsonb)','EXECUTE')
  or has_table_privilege('authenticated','public.admin_review_research_jobs','SELECT') then
   raise exception 'Research authority leaked to a browser role'; end if;
 if public.review_case_key('{"queue_type":"general-review","entity_id":"123","meta":{"review_type":"venue_link_candidate"}}')
  <> public.review_case_key('{"queue_type":"event-quality","entity_id":"123","meta":{"issue_code":"NAMED_VENUE_UNLINKED"}}') then
   raise exception 'Sibling venue findings do not consolidate'; end if;
 if public.review_case_key('{"id":"a","queue_type":"event-quality","entity_id":"one","meta":{"issue_code":"IMAGE_CONTENT_REUSED","evidence":{"content_hash":"same"}}}')
  <> public.review_case_key('{"id":"b","queue_type":"event-quality","entity_id":"two","meta":{"issue_code":"IMAGE_CONTENT_REUSED","evidence":{"content_hash":"same"}}}') then
   raise exception 'Identical artwork hashes do not consolidate'; end if;
 if public.review_case_key('{"id":"a","queue_type":"event-quality","meta":{"issue_code":"IMAGE_CONTENT_REUSED","evidence":{"content_hash":"first"}}}')
  = public.review_case_key('{"id":"b","queue_type":"event-quality","meta":{"issue_code":"IMAGE_CONTENT_REUSED","evidence":{"content_hash":"second"}}}') then
   raise exception 'Different artwork merged'; end if;
 insert into public.admin_review_cases(id,case_key,family,stage,required_role,item,members,fingerprint,created_at)
 values(v_id,'fixture:'||v_id,'fixture','research','admin','{}','[]','v1','1900-01-01');
 insert into public.admin_review_research_jobs(case_id,fingerprint) values(v_id,'v1');
 v_jobs:=public.claim_admin_review_research_jobs(8);
 select (j->>'lease_token')::uuid into v_lease from jsonb_array_elements(v_jobs) j where j->>'case_id'=v_id::text;
 if v_lease is null then raise exception 'Fixture job was not claimed'; end if;
 if exists(select 1 from jsonb_array_elements(public.claim_admin_review_research_jobs(8)) j where j->>'case_id'=v_id::text) then
  raise exception 'A live lease was claimed twice'; end if;
 v_result:=public.finish_admin_review_research_job(v_id,gen_random_uuid(),'completed','{"decision_ready":true}');
 if v_result then raise exception 'Wrong lease token accepted'; end if;
 update public.admin_review_cases set fingerprint='v2' where id=v_id;
 v_result:=public.finish_admin_review_research_job(v_id,v_lease,'completed','{"decision_ready":true}');
 if v_result then raise exception 'Stale evidence result accepted'; end if;
 update public.admin_review_cases set fingerprint='v1' where id=v_id;
 v_result:=public.finish_admin_review_research_job(v_id,v_lease,'retry','{"reason":"Transient source failure"}');
 if not v_result or not exists(select 1 from public.admin_review_research_jobs where case_id=v_id and status='retry' and next_attempt_at>now()+interval '50 minutes') then
  raise exception 'Retry backoff not applied'; end if;
end $test$;
rollback;
