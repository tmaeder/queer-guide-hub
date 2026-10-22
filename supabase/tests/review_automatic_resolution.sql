begin;
set local statement_timeout='90s';
do $test$
declare e jsonb; result jsonb; before_count bigint; city public.cities; venue_id uuid:=gen_random_uuid();
begin
 e:='{"quality_status":"passed","auto_publish":true,"auto_publish_blocked_reasons":[],"quality_decision":{"title":"Source article","cleanedBody":"Source text","confidence":0.9,"relevanceScore":0.9,"qualityScoreAfter":0.85,"needsManualReview":false,"isRelevant":true,"isSatire":false,"isAdvertorial":false}}';
 if api_private.review_news_machine_outcome(e) is distinct from 'publish' then raise exception 'Clean existing gate did not pass'; end if;
 if api_private.review_news_machine_outcome(jsonb_set(e,'{quality_decision,needsManualReview}','true')) is not null then raise exception 'Manual review bypassed'; end if;
 if api_private.review_news_machine_outcome(jsonb_set(e,'{quality_decision,confidence}','0.2')) is not null then raise exception 'Low confidence passed'; end if;
 if api_private.review_news_machine_outcome(jsonb_set(e,'{auto_publish_blocked_reasons}','["image_unusable"]')) is not null then raise exception 'Image gate bypassed'; end if;
 if api_private.review_news_machine_outcome(e-'auto_publish') is not null then raise exception 'Absent auto publish is approval'; end if;
 if api_private.review_news_machine_outcome(jsonb_set(e,'{quality_decision,confidence}','"invalid"')) is not null then raise exception 'Malformed confidence passed'; end if;
 if api_private.review_news_machine_outcome('{"quality_status":"rejected","quality_decision":{}}') is not null then raise exception 'Missing extraction rejected'; end if;
 e:=jsonb_set(jsonb_set(jsonb_set(e,'{quality_status}','"rejected"'),'{quality_decision,isRelevant}','false'),'{quality_decision,relevanceScore}','0.1');
 if api_private.review_news_machine_outcome(e) is distinct from 'reject' then raise exception 'Explicit negative verdict ignored'; end if;
 if has_function_privilege('authenticated','public.run_review_automatic_resolution(integer,boolean)','execute')
  or has_function_privilege('anon','public.run_review_automatic_resolution(integer,boolean)','execute')
  or has_function_privilege('authenticated','api_private.run_review_automatic_resolution(integer,boolean)','execute')
 then raise exception 'Browser role can run sweep'; end if;

 select count(*) into before_count from public.admin_review_repairs;
 result:=public.run_review_automatic_resolution(0,true);
 if result->>'dry_run' is distinct from 'true' or (select count(*) from public.admin_review_repairs)<>before_count
 then raise exception 'Dry run wrote repairs or failed: %',result; end if;
 update public.admin_automations set enabled=false where slug='review_automatic_resolution';
 if public.run_review_automatic_resolution(500,false)->>'skipped' is distinct from 'paused' then raise exception 'Pause ignored'; end if;
 update public.admin_automations set enabled=true where slug='review_automatic_resolution';

 select c.* into city from public.cities c join public.geo_cms_verifications v on v.place_id=c.id
  where api_private.review_inactive_city_unlinked(c.id) limit 1;
 if not found then raise exception 'No inactive unlinked fixture found'; end if;
 update public.geo_cms_verifications set status='review' where place_id=city.id;
 if (select status from public.geo_cms_verifications where place_id=city.id) is distinct from 'not_applicable'
 then raise exception 'Unused archived city was not classified not applicable'; end if;
 update public.cities set shell_status='real' where id=city.id;
 if (select status from public.geo_cms_verifications where place_id=city.id) is distinct from 'review'
 then raise exception 'Reactivation did not reopen review'; end if;
 update public.cities set shell_status='ghost' where id=city.id;
 update public.geo_cms_verifications set status='review' where place_id=city.id;
 insert into public.venues(id,name,slug,category,address,city_id,country_id)
 values(venue_id,'Review resolution regression fixture','review-resolution-'||venue_id,'bar','Regression fixture only',city.id,city.country_id);
 if api_private.review_inactive_city_unlinked(city.id)
  or (select status from public.geo_cms_verifications where place_id=city.id) is distinct from 'review'
 then raise exception 'Linked archived city was dismissed or did not reopen'; end if;
 if (select checks->>'identity_verified' from public.geo_cms_verifications where place_id=city.id)='true'
 then raise exception 'Inactive city was falsely verified'; end if;
end $test$;
rollback;
