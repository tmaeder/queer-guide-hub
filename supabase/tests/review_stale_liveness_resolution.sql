begin;
set local statement_timeout='40s';
do $test$
declare expired uuid:=gen_random_uuid(); live uuid:=gen_random_uuid(); manual uuid:=gen_random_uuid();
 external_case uuid:=gen_random_uuid(); result jsonb; original jsonb:='{"fixture":"original evidence"}';
begin
 perform pg_advisory_xact_lock(hashtext('review_automatic_resolution'));
 insert into public.events(id,title,event_type,start_date,end_date,slug,status,website,last_verified_at)
 select id,'Automatic liveness regression fixture','other',
 case when id=live then now()+interval '2 days' else now()-interval '2 days' end,
 case when id=live then now()+interval '3 days' else now()-interval '1 day' end,
 'review-liveness-fixture-'||id,'active','https://example.org/events/regression',null
 from unnest(array[expired,live,manual,external_case]) id;
 insert into public.event_quality_issues(event_id,dimension,issue_code,severity,detector,evidence,evidence_hash)
 select id,'freshness','LIVENESS_STALE','high',
 case when id=external_case then 'external-regression-fixture' else 'event-quality-scan' end,original,md5(original::text)
 from unnest(array[expired,live,manual,external_case]) id;
 update public.event_quality_issues set reviewed_at=now(),resolution='Editor requested review'
 where event_id=manual and issue_code='LIVENESS_STALE';
 if not exists(select 1 from public.event_quality_findings(live) where issue_code='LIVENESS_STALE')
 then raise exception 'Live fixture must still report a liveness finding'; end if;
 if exists(select 1 from public.event_quality_findings(expired) where issue_code='LIVENESS_STALE')
 then raise exception 'Expired fixture must no longer report liveness'; end if;
 result:=public.run_review_automatic_resolution(200,true);
 if coalesce((result->>'stale_liveness_findings')::integer,0)<1 then raise exception 'Dry run did not find stale fixture: %',result; end if;
 if (select status from public.event_quality_issues where event_id=expired and issue_code='LIVENESS_STALE')<>'open'
 then raise exception 'Dry run changed the issue'; end if;
 result:=public.run_review_automatic_resolution(200,false);
 if (select status from public.event_quality_issues where event_id=expired and issue_code='LIVENESS_STALE')<>'resolved'
 then raise exception 'Obsolete liveness finding was not reconciled: %',result; end if;
 if exists(select 1 from public.event_quality_issues where event_id in(live,manual,external_case)
  and issue_code='LIVENESS_STALE' and status<>'open')
 then raise exception 'Current, human-touched or external finding was incorrectly cleared'; end if;
 if exists(select 1 from public.event_quality_issues where event_id=expired and issue_code='LIVENESS_STALE'
  and (evidence is distinct from original or reviewed_by is not null or reviewed_at is not null))
 then raise exception 'Evidence or human review attribution changed'; end if;
 if not exists(select 1 from public.admin_review_repairs a join public.event_quality_issues i on i.id=a.entity_id
  where i.event_id=expired and a.reason='stale_liveness_finding_cleared'
  and a.previous_value->>'status'='open' and a.next_value->>'status'='resolved'
  and a.previous_value->'evidence'=a.next_value->'evidence')
 then raise exception 'Complete machine audit missing'; end if;
 if exists(select 1 from public.events where id=expired and last_verified_at is not null)
 then raise exception 'Resolution falsely verified event liveness'; end if;
end $test$;
rollback;
