-- Default dry run. Supply fresh read-only collector proofs in the local
-- matching.cdn_image_proofs setting. Reuse the native auditor's exclusive lease.
-- Only originally unreviewed HTTP-405 findings with fully passing cover evidence
-- are cleared. Source assets, event data, human decisions and other issues stay.
begin;
set local statement_timeout='30s';set local lock_timeout='2s';
do $repair$
declare dry_run boolean:=true;batch_size integer:=20;claim_token uuid:=gen_random_uuid();outcome jsonb;
begin
 perform public.assert_admin_or_internal();
 if auth.uid() is not null then raise exception 'Automatic image rechecks require an internal actor';end if;
 if not dry_run then
  -- The existing claim RPC acquires its global lease even for a zero-row claim.
  -- We recheck ownership explicitly rather than assuming a void result acquired it.
  perform public.claim_event_image_quality_candidates(claim_token,0);
  if not exists(select 1 from public.event_quality_worker_leases where worker='event-image-quality'
   and lease_token=claim_token and lease_until>now()) then
   perform set_config('matching.cdn_image_result','{"skipped":true,"reason":"native_image_worker_busy"}',false);return;
  end if;
 end if;
 with input as materialized(
  select * from jsonb_to_recordset(coalesce(nullif(current_setting('matching.cdn_image_proofs',true),''),'[]')::jsonb)
  as x(event_id uuid,image_url text,issue_id uuid,expected_event_updated_at timestamptz,
   expected_issue_hash text,expected_observation_checked_at timestamptz,observed_at timestamptz,
   probe_role text,http_status integer,mime_type text,byte_size bigint,width integer,height integer,
   content_hash text,url_hash text)
 ), reused as materialized(
  -- Match the native auditor's ten-observation threshold after these upserts,
  -- including all supplied passing records rather than just this small batch.
  select content_hash from(
   select event_id,image_url,content_hash from input
   union select o.event_id,o.image_url,o.content_hash from public.event_image_quality_observations o
    where o.content_hash in(select content_hash from input)
  ) all_observations group by content_hash having count(*)>=10
 ), eligible as materialized(
  select x.* from input x join public.events e on e.id=x.event_id
  join public.event_image_quality_observations o on o.event_id=e.id and o.image_url=x.image_url
  join public.event_quality_issues i on i.id=x.issue_id and i.event_id=e.id
  where e.duplicate_of_id is null and coalesce(e.status,'active') not in('archived','rejected','cancelled')
   and e.images[1]=x.image_url and e.updated_at=x.expected_event_updated_at
   and i.status='open' and i.issue_code='IMAGE_UNREACHABLE' and i.detector='event-image-quality'
   and i.reviewed_by is null and i.reviewed_at is null and i.evidence_hash=x.expected_issue_hash
   and i.evidence->>'url'=x.image_url and i.evidence->>'http_status'='405'
   and o.http_status=405 and o.checked_at=x.expected_observation_checked_at
   and x.image_url~'^https://img\.queer\.guide/event-images/[a-f0-9]{64}\.(jpg|jpeg|png|webp)$'
   and x.observed_at between now()-interval '1 hour' and now()+interval '5 minutes'
   and x.probe_role='cover' and x.http_status=200 and x.width>=800 and x.height>=450
   and x.byte_size between 20000 and 12582912
   and x.byte_size::numeric/(x.width::numeric*x.height)>=0.05
   and x.mime_type in('image/jpeg','image/jpg','image/png','image/webp','image/gif')
   and x.content_hash~'^[a-f0-9]{64}$'
   and x.url_hash=encode(extensions.digest(x.image_url,'sha256'),'hex')
   and not exists(select 1 from reused r where r.content_hash=x.content_hash)
   and not exists(select 1 from input other where other.event_id=x.event_id and other.issue_id<>x.issue_id)
  order by e.id limit greatest(0,least(batch_size,100)) for update of e,o,i skip locked
 ), observed as(
  update public.event_image_quality_observations o set content_hash=x.content_hash,url_hash=x.url_hash,
   http_status=200,mime_type=x.mime_type,byte_size=x.byte_size,width=x.width,height=x.height,
   probe_status='pass',failure_reason=null,checked_at=x.observed_at
  from eligible x where o.event_id=x.event_id and o.image_url=x.image_url and not dry_run
  returning o.event_id
 ), cleared as(
  update public.event_quality_issues i set status='resolved',resolved_at=now(),reviewed_at=now(),
   resolution='cleared_by_image_audit:cdn_head_recheck:v1 '||jsonb_build_object('url',x.image_url,
    'content_hash',x.content_hash,'observed_at',x.observed_at,'probe_role','cover','automated',true,'human_reviewed',false)::text
  from eligible x join observed o on o.event_id=x.event_id where i.id=x.issue_id
   and i.status='open' and i.reviewed_by is null and i.reviewed_at is null
  returning i.id,i.event_id
 ) select jsonb_build_object('dry_run',dry_run,'candidates',(select count(*) from eligible),
  'observations_updated',(select count(*) from observed),'findings_cleared',(select count(*) from cleared),
  'evidence',(select coalesce(jsonb_agg(to_jsonb(e)-'expected_issue_hash'),'[]') from eligible e)) into outcome;
 if not dry_run then perform public.release_event_quality_worker_lease('event-image-quality',claim_token);end if;
 perform set_config('matching.cdn_image_result',outcome::text,false);
end $repair$;
select current_setting('matching.cdn_image_result')::jsonb result;
commit;
