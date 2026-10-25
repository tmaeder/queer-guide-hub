-- 99991792953831_review_news_source_text_recovery
--
-- Already-enriched articles otherwise passing the quality gate never enter
-- the pending-enrichment extractor. Recover their source text under a bounded
-- lease, then require a fresh quality verdict before any publication.

-- Recover missing source text before asking for another editorial verdict.
-- Only an otherwise passing, untouched truncated-body review may be claimed.
create function api_private.review_news_source_recovery_eligible(s public.ingestion_staging)
returns boolean language sql immutable set search_path='' as $fn$
 select coalesce(s.target_table='news_articles' and s.disposition='pending' and s.review_status='pending_review'
 and s.reviewed_by is null and s.reviewed_at is null and s.enrichment_status in('enriched','completed')
 and s.dedup_status is distinct from 'duplicate'
 and s.enriched_data->>'quality_status'='review' and s.enriched_data->'auto_publish'='false'::jsonb
 and s.enriched_data->'auto_publish_blocked_reasons'='["truncated_body"]'::jsonb
 and coalesce(s.normalized_data->'extraction_meta','null')='null'::jsonb
 and exists(select 1 from unnest(array[s.normalized_data->>'url',s.normalized_data#>>'{urls,0}',
  s.normalized_data#>>'{metadata,url}',s.normalized_data->>'source_url'])source_url where btrim(source_url)~'^https?://')
 and s.enriched_data#>'{quality_decision,needsManualReview}'='false'::jsonb
 and s.enriched_data#>'{quality_decision,shouldPublish}'='true'::jsonb
 and s.enriched_data#>'{quality_decision,isRelevant}'='true'::jsonb
 and s.enriched_data#>'{quality_decision,isSatire}'='false'::jsonb
 and s.enriched_data#>'{quality_decision,isAdvertorial}'='false'::jsonb
 and case when jsonb_typeof(s.enriched_data#>'{quality_decision,confidence}')='number'
  then (s.enriched_data#>>'{quality_decision,confidence}')::numeric between 0.7 and 1 else false end
 and case when jsonb_typeof(s.enriched_data#>'{quality_decision,relevanceScore}')='number'
  then (s.enriched_data#>>'{quality_decision,relevanceScore}')::numeric between 0.75 and 1 else false end
 and case when jsonb_typeof(s.enriched_data#>'{quality_decision,qualityScoreAfter}')='number'
  then (s.enriched_data#>>'{quality_decision,qualityScoreAfter}')::numeric between 0.7 and 1 else false end,false);
$fn$;
revoke all on function api_private.review_news_source_recovery_eligible(public.ingestion_staging) from public,anon,authenticated;
grant execute on function api_private.review_news_source_recovery_eligible(public.ingestion_staging) to service_role;

create function api_private.review_news_source_recovery_due(e jsonb)
returns boolean language sql stable set search_path='' as $fn$
 select case when coalesce(e->'review_source_text_recovery','null')='null'::jsonb then true
 when e#>>'{review_source_text_recovery,contract}'='news_source_text_recovery.v1'
  and e#>>'{review_source_text_recovery,status}'='running'
  and e#>>'{review_source_text_recovery,attempts}'~'^[01]$'
  and pg_input_is_valid(e#>>'{review_source_text_recovery,lease_expires_at}','timestamp with time zone')
 then (e#>>'{review_source_text_recovery,lease_expires_at}')::timestamptz<now() else false end;
$fn$;
revoke all on function api_private.review_news_source_recovery_due(jsonb) from public,anon,authenticated;
grant execute on function api_private.review_news_source_recovery_due(jsonb) to service_role;

create function api_private.claim_review_news_source_recovery(p_batch integer default 4,p_dry_run boolean default true)
returns table(id uuid,normalized_data jsonb,lease_token uuid)
language plpgsql security definer set search_path='' as $fn$
declare r public.ingestion_staging;token uuid;marker jsonb;
begin
 perform public.assert_admin_or_internal();
 if auth.uid()is not null then raise exception 'Internal source recovery actor required';end if;
 if exists(select 1 from public.admin_automations where slug='review_automatic_resolution'and not enabled)then return;end if;
 for r in select s.* from public.ingestion_staging s
  where s.target_table='news_articles' and s.disposition='pending' and s.review_status='pending_review'
  and api_private.review_news_source_recovery_eligible(s) and api_private.review_news_source_recovery_due(s.enriched_data)
  order by s.created_at,s.id limit greatest(0,least(coalesce(p_batch,0),4))for update of s skip locked
 loop
  token:=gen_random_uuid();
  if p_dry_run is distinct from false then
   id:=r.id;normalized_data:=r.normalized_data;lease_token:=token;return next;continue;
  end if;
  marker:=jsonb_build_object('contract','news_source_text_recovery.v1','status','running','lease_token',token,
   'lease_expires_at',now()+interval '5 minutes','attempted_at',now(),
   'attempts',coalesce((r.enriched_data#>>'{review_source_text_recovery,attempts}')::int,0)+1,
   'source_fingerprint',md5(r.normalized_data::text),
   'quality_fingerprint',md5((r.enriched_data-'review_source_text_recovery')::text));
  update public.ingestion_staging s set enriched_data=coalesce(s.enriched_data,'{}')||jsonb_build_object('review_source_text_recovery',marker),
   updated_at=now()where s.id=r.id;
  id:=r.id;normalized_data:=r.normalized_data;lease_token:=token;return next;
 end loop;
end $fn$;
revoke all on function api_private.claim_review_news_source_recovery(integer,boolean) from public,anon,authenticated;
grant execute on function api_private.claim_review_news_source_recovery(integer,boolean) to service_role;
create function public.claim_review_news_source_recovery(p_batch integer default 4,p_dry_run boolean default true)
returns table(id uuid,normalized_data jsonb,lease_token uuid)language sql set search_path='' as $fn$
 select *from api_private.claim_review_news_source_recovery(p_batch,p_dry_run);
$fn$;
revoke all on function public.claim_review_news_source_recovery(integer,boolean) from public,anon,authenticated;
grant execute on function public.claim_review_news_source_recovery(integer,boolean) to service_role;

create function api_private.finish_review_news_source_recovery(p_id uuid,p_lease_token uuid,p_normalized jsonb)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare r public.ingestion_staging;marker jsonb;meta jsonb;after_row jsonb;next_enriched jsonb;original text;recovered boolean;
begin
 perform public.assert_admin_or_internal();
 if auth.uid()is not null then raise exception 'Internal source recovery actor required';end if;
 if exists(select 1 from public.admin_automations where slug='review_automatic_resolution'and not enabled)
 then return '{"saved":false,"reason":"paused"}';end if;
 select * into r from public.ingestion_staging where id=p_id for update;
 if not found then return '{"saved":false,"reason":"missing"}';end if;
 marker:=r.enriched_data->'review_source_text_recovery';meta:=p_normalized->'extraction_meta';
 if not api_private.review_news_source_recovery_eligible(r)
  or marker->>'status'is distinct from 'running' or marker->>'lease_token'is distinct from p_lease_token::text
  or (case when pg_input_is_valid(marker->>'lease_expires_at','timestamp with time zone')
   then (marker->>'lease_expires_at')::timestamptz<now()else true end)
  or md5(r.normalized_data::text)is distinct from marker->>'source_fingerprint'
  or md5((r.enriched_data-'review_source_text_recovery')::text)is distinct from marker->>'quality_fingerprint'
 then return '{"saved":false,"reason":"stale"}';end if;
 if jsonb_typeof(p_normalized)is distinct from 'object'
  or (p_normalized-'content'-'markdown'-'extraction_meta')is distinct from(r.normalized_data-'content'-'markdown'-'extraction_meta')
  or meta->>'recovery_contract'is distinct from 'news_source_text_recovery.v1'
  or jsonb_typeof(meta->'applied')is distinct from 'boolean'
  or not exists(select 1 from unnest(array[r.normalized_data->>'url',r.normalized_data#>>'{urls,0}',
    r.normalized_data#>>'{metadata,url}',r.normalized_data->>'source_url',r.normalized_data->>'website'])source_url
   where nullif(btrim(source_url),'')=meta->>'url')
 then raise exception 'Source recovery may only propose captured text and extraction metadata';end if;
 original:=coalesce(nullif(btrim(r.normalized_data->>'content',E' \t\r\n'),''),
  nullif(btrim(r.normalized_data->>'body',E' \t\r\n'),''),nullif(btrim(r.normalized_data->>'markdown',E' \t\r\n'),''),r.normalized_data->>'description','');
 recovered:=meta->>'applied'='true';
 if recovered and (jsonb_typeof(p_normalized->'content')is distinct from 'string'
  or length(btrim(p_normalized->>'content'))not between 280 and 100000
  or length(btrim(p_normalized->>'content'))<=length(original)*1.2
  or nullif(btrim(meta->>'page_title'),'')is null
  or meta->>'matched_title'is distinct from coalesce(nullif(btrim(r.normalized_data->>'title',E' \t\r\n'),''),btrim(r.normalized_data->>'name',E' \t\r\n')))
 then raise exception 'Recovered source text has no material verified gain';end if;
 if not recovered and (p_normalized->'content'is distinct from r.normalized_data->'content'
  or p_normalized->'markdown'is distinct from r.normalized_data->'markdown')
 then raise exception 'A failed extraction cannot replace source content';end if;
 marker:=(marker-'lease_token'-'lease_expires_at'-'source_fingerprint'-'quality_fingerprint')||jsonb_build_object(
  'status',case when recovered then 'recovered'else 'no_gain'end,'finished_at',now(),'source_url',meta->>'url',
  'method',meta->>'method','requires_fresh_quality',recovered,'human_reviewed',false);
 next_enriched:=r.enriched_data;
 if recovered then
  next_enriched:=next_enriched-array['quality_status','quality_decision','quality_input_version','auto_publish_blocked_reasons',
   'quality_resolved_links','quality_last_error','quality_run_at'];
  next_enriched:=next_enriched||jsonb_build_object('auto_publish',false,'quality_attempts',0);
 end if;
 next_enriched:=next_enriched||jsonb_build_object('review_source_text_recovery',marker);
 perform set_config('app.actor','system:review-news-source-recovery:v1',true);
 update public.ingestion_staging s set normalized_data=p_normalized,enriched_data=next_enriched,updated_at=now()
  where s.id=r.id returning to_jsonb(s)into after_row;
 if after_row-array['normalized_data','enriched_data','updated_at']is distinct from to_jsonb(r)-array['normalized_data','enriched_data','updated_at']
 then raise exception 'Source recovery changed protected staging state';end if;
 insert into public.admin_review_repairs(entity_type,entity_id,reason,previous_value,next_value)
  values('staging',r.id,case when recovered then 'news_source_text_recovered_for_fresh_quality'else 'news_source_text_recovery_no_gain'end,to_jsonb(r),after_row);
 return jsonb_build_object('saved',true,'recovered',recovered);
end $fn$;
revoke all on function api_private.finish_review_news_source_recovery(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function api_private.finish_review_news_source_recovery(uuid,uuid,jsonb) to service_role;
create function public.finish_review_news_source_recovery(p_id uuid,p_lease_token uuid,p_normalized jsonb)
returns jsonb language sql set search_path='' as $fn$
 select api_private.finish_review_news_source_recovery(p_id,p_lease_token,p_normalized);
$fn$;
revoke all on function public.finish_review_news_source_recovery(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.finish_review_news_source_recovery(uuid,uuid,jsonb) to service_role;

create function api_private.enqueue_review_news_source_recovery(p_batch integer default 4,p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare needs_source boolean;needs_quality boolean;source_request bigint;quality_request bigint;headers jsonb;anon_key text;internal_secret text;
begin
 perform public.assert_admin_or_internal();
 if auth.uid()is not null then raise exception 'Internal source recovery actor required';end if;
 if coalesce(p_batch,0)<=0 then return '{"source_recovery_requests_queued":0,"source_quality_requests_queued":0}';end if;
 if exists(select 1 from public.admin_automations where slug='review_automatic_resolution'and not enabled)
 then return '{"source_recovery_enqueue_skipped":"paused"}';end if;
 select exists(select 1 from public.ingestion_staging s where s.target_table='news_articles'
  and s.disposition='pending' and s.review_status='pending_review' and api_private.review_news_source_recovery_eligible(s)
  and api_private.review_news_source_recovery_due(s.enriched_data))into needs_source;
 select exists(select 1 from public.ingestion_staging s where s.target_table='news_articles'and s.disposition='pending'
  and s.review_status='pending_review'and s.reviewed_by is null and s.reviewed_at is null
  and s.dedup_status is distinct from 'duplicate'
  and s.enrichment_status in('enriched','completed')and s.enriched_data->'quality_status'is null
  and s.enriched_data#>>'{review_source_text_recovery,status}'='recovered'
  and s.normalized_data#>>'{extraction_meta,recovery_contract}'='news_source_text_recovery.v1')
  and exists(select 1 from public.news_quality_settings where id=1 and enabled)into needs_quality;
 if p_dry_run is distinct from false then
  return jsonb_build_object('source_recovery_needed',needs_source,'recovered_source_quality_needed',needs_quality,
   'source_recovery_requests_queued',0,'source_quality_requests_queued',0);
 end if;
 if needs_source or needs_quality then
  select decrypted_secret into anon_key from vault.decrypted_secrets where name='legacy_anon_key';
  select decrypted_secret into internal_secret from vault.decrypted_secrets where name='internal_invoke_secret';
  if anon_key is null or internal_secret is null then return '{"source_recovery_enqueue_skipped":"credentials_unavailable"}';end if;
  headers:=jsonb_build_object('Authorization','Bearer '||anon_key,'Content-Type','application/json','x-internal-secret',internal_secret);
  if needs_source then
   source_request:=public.automation_http_post(url:='https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/pipeline-extract-fulltext',
    headers:=headers,body:=jsonb_build_object('repair_truncated',true,'batch_size',least(4,p_batch)),timeout_milliseconds:=90000);
  end if;
  if needs_quality then
   quality_request:=public.automation_http_post(url:='https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/pipeline-quality-enhance',
    headers:=headers,body:=jsonb_build_object('batch_size',least(8,p_batch),'concurrency',least(4,p_batch)),timeout_milliseconds:=170000);
  end if;
 end if;
 return jsonb_build_object('source_recovery_requests_queued',case when source_request is null then 0 else 1 end,
  'source_quality_requests_queued',case when quality_request is null then 0 else 1 end);
end $fn$;
revoke all on function api_private.enqueue_review_news_source_recovery(integer,boolean) from public,anon,authenticated;
grant execute on function api_private.enqueue_review_news_source_recovery(integer,boolean) to service_role;

do $hook$
declare definition text;anchor text:='return api_private.reconcile_publisher_event_copy(v_limit,p_dry_run) || jsonb_build_object(';
begin
 definition:=pg_get_functiondef('api_private.run_review_automatic_resolution(integer,boolean)'::regprocedure);
 if(length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then raise exception 'Review cleanup source enqueue hook changed';end if;
 execute replace(definition,anchor,'return api_private.enqueue_review_news_source_recovery(v_limit,p_dry_run) || '||substring(anchor from 8));
end $hook$;
