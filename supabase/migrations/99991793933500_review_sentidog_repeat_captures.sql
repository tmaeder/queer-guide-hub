-- SentidoG sometimes emits the same RSS item under a different date path.
-- Compare the whole capture except its URL and retain all quality evidence.
create index ingestion_staging_sentidog_published_slug_idx
on public.ingestion_staging ((regexp_replace(rtrim(source_entity_id,'/'),'^.*/','')))
where source_name='rss-news' and target_table='news_articles'
 and disposition='inserted' and review_status='auto'
 and source_entity_id like 'https://www.sentidog.com/%';

create function api_private.reconcile_sentidog_repeat_captures(p_batch integer,p_dry_run boolean)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare
 r record;
 after_row jsonb;
 ids uuid[]:='{}';
begin
 perform public.assert_admin_or_internal();
 if auth.uid() is not null then raise exception 'Internal actor required';end if;
 if exists(select 1 from public.admin_automations where slug='review_automatic_resolution' and not enabled)
 then return jsonb_build_object('skipped','paused');end if;
 if not pg_try_advisory_xact_lock(hashtext('review_automatic_resolution'))
 then return jsonb_build_object('skipped','already_running');end if;

 for r in
 select s.id,k.id prior_id,a.id article_id,a.url canonical_url,to_jsonb(s) old_row
 from public.ingestion_staging s
 join lateral (
  select prior.id,prior.target_record_id,prior.source_entity_id,count(*) over() match_count
  from public.ingestion_staging prior
  where prior.source_name='rss-news' and prior.target_table='news_articles'
   and prior.disposition='inserted' and prior.review_status='auto'
   and prior.source_entity_id like 'https://www.sentidog.com/%'
   and prior.source_entity_id ~ '^https://www\.sentidog\.com/[0-9]{4}/[0-9]{2}/[0-9]{2}/[a-z0-9-]+/?$'
   and regexp_replace(rtrim(prior.source_entity_id,'/'),'^.*/','')=regexp_replace(rtrim(s.source_entity_id,'/'),'^.*/','')
   and split_part(prior.source_entity_id,'/',4)||'/'||split_part(prior.source_entity_id,'/',5)||'/'||split_part(prior.source_entity_id,'/',6)
    <>split_part(s.source_entity_id,'/',4)||'/'||split_part(s.source_entity_id,'/',5)||'/'||split_part(s.source_entity_id,'/',6)
   and prior.source_entity_id=prior.raw_data->>'url'
   and prior.raw_data-'url'=s.raw_data-'url'
 ) proof on proof.match_count=1
 join public.ingestion_staging k on k.id=proof.id
  and k.source_name='rss-news' and k.target_table='news_articles'
  and k.disposition='inserted' and k.review_status='auto'
  and k.target_record_id=proof.target_record_id and k.source_entity_id=proof.source_entity_id
  and k.source_entity_id=k.raw_data->>'url' and k.raw_data-'url'=s.raw_data-'url'
 join public.news_articles a on a.id=proof.target_record_id
  and a.url=proof.source_entity_id and a.source_id::text=s.raw_data->>'source_id'
 where s.source_name='rss-news' and s.target_table='news_articles'
  and s.disposition='pending' and s.review_status='pending_review' and s.target_record_id is null
  and s.reviewed_by is null and s.reviewed_at is null and s.review_notes is null
  and s.source_entity_id ~ '^https://www\.sentidog\.com/[0-9]{4}/[0-9]{2}/[0-9]{2}/[a-z0-9-]+/?$'
  and s.source_entity_id=s.raw_data->>'url' and length(s.raw_data->>'content')>=50
  and a.duplicate_of_id is null and a.quality_status='passed'
  and coalesce(s.dedup_match_table,'news_articles')='news_articles'
  and ((s.dedup_status='merge_candidate' and s.dedup_match_id=a.id)
    or (s.dedup_status='unique' and s.dedup_match_id is null))
  and jsonb_typeof(coalesce(s.dedup_details,'{}'))='object'
  and not coalesce(s.dedup_details,'{}') ? 'manual_hold'
  and not coalesce(s.enriched_data,'{}') ?| array['manual_hold','manual_review_required','review_source_text_recovery']
  and ((s.enriched_data->'auto_publish_blocked_reasons') -
   array['low_relevance','low_quality','low_confidence','manual_review_requested','truncated_body','image_unusable'])='[]'::jsonb
  and s.enriched_data#>>'{quality_decision,isAdvertorial}'='false'
  and s.enriched_data#>>'{quality_decision,isSatire}'='false'
  and not exists(
   select 1 from jsonb_array_elements_text(case when jsonb_typeof(s.enriched_data#>'{quality_decision,warnings}')='array'
    then s.enriched_data#>'{quality_decision,warnings}' else '[]'::jsonb end) warning
   where warning ~* 'paywall|verify facts independently')
  and not exists(select 1 from public.content_revisions h where h.source_table='ingestion_staging'
   and h.source_id=s.id and h.actor_kind='human')
 order by s.created_at,s.id limit greatest(0,least(coalesce(p_batch,0),100))
 for update of s skip locked for share of k,a skip locked
 loop
  ids:=array_append(ids,r.id);
  if p_dry_run is distinct from false then continue;end if;
  update public.ingestion_staging s set disposition='skipped',target_record_id=r.article_id,
   dedup_status='duplicate',dedup_match_id=r.article_id,dedup_match_table='news_articles',dedup_match_score=1,
   processed_at=now(),updated_at=now(),
   dedup_details=coalesce(s.dedup_details,'{}')||jsonb_build_object('publisher_date_path_duplicate',jsonb_build_object(
    'canonical_url',r.canonical_url,'original_url',s.source_entity_id,'prior_capture_id',r.prior_id,
    'raw_capture_hash',encode(extensions.digest(convert_to((s.raw_data-'url')::text,'UTF8'),'sha256'),'hex'),
    'human_reviewed',false,'at',now())),
   review_notes='Automatic duplicate capture. The SentidoG URL date segment changed, while the story slug and all other RSS fields match the published capture.'
  where s.id=r.id returning to_jsonb(s) into after_row;
  if after_row-array['disposition','target_record_id','dedup_status','dedup_match_id','dedup_match_table',
   'dedup_match_score','processed_at','updated_at','dedup_details','review_notes']
   is distinct from r.old_row-array['disposition','target_record_id','dedup_status','dedup_match_id','dedup_match_table',
   'dedup_match_score','processed_at','updated_at','dedup_details','review_notes']
  then raise exception 'Unexpected staging mutation %',r.id;end if;
  insert into public.admin_review_repairs(entity_type,entity_id,reason,previous_value,next_value)
  values('ingestion_staging',r.id,'sentidog_exact_date_path_duplicate:v3',r.old_row,after_row);
 end loop;
 return jsonb_build_object('dry_run',p_dry_run,'duplicate_sources',cardinality(ids),'staging_ids',to_jsonb(ids));
end $fn$;

revoke all on function api_private.reconcile_sentidog_repeat_captures(integer,boolean) from public,anon,authenticated;
grant execute on function api_private.reconcile_sentidog_repeat_captures(integer,boolean) to service_role;

do $hook$
declare
 definition text:=pg_get_functiondef('api_private.run_review_automatic_resolution(integer,boolean)'::regprocedure);
 anchor text:=$anchor$jsonb_build_object('dry_run',p_dry_run,$anchor$;
begin
 if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1
 then raise exception 'Automatic resolution return contract changed';end if;
 execute replace(definition,anchor,'jsonb_build_object(''sentidog_repeat_captures'',api_private.reconcile_sentidog_repeat_captures(v_limit,p_dry_run)) || '||anchor);
end $hook$;
