-- A repeated RSS source capture is a duplicate submission, not a new publication
-- decision. Match original headline fingerprint, source/body/date/media exactly;
-- preserve quality evidence and never update or republish the catalogue article.
create function api_private.reconcile_exact_news_source_duplicates(p_batch integer default 50,p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare r record;after_stage jsonb;after_article jsonb;n integer:=0;ids jsonb:='[]';
begin
 perform public.assert_admin_or_internal();
 if auth.uid()is not null then raise exception 'Internal actor required';end if;
 if exists(select 1 from public.admin_automations where slug='review_automatic_resolution'and not enabled)
 then return jsonb_build_object('skipped','paused');end if;
 if not pg_try_advisory_xact_lock(hashtext('review_automatic_resolution'))
 then return jsonb_build_object('skipped','already_running');end if;
 for r in select s.id,article.id article_id,to_jsonb(s)old_stage,to_jsonb(article)old_article
 from public.ingestion_staging s join public.news_articles article on article.url=s.normalized_data#>>'{urls,0}'
 where s.target_table='news_articles'and s.source_name='rss-news'and s.source_type='rss-news'
 and s.disposition='pending'and s.review_status='pending_review'
 and s.reviewed_by is null and s.reviewed_at is null and s.review_notes is null and s.target_record_id is null
 and coalesce(s.dedup_status,'pending')in('pending','unique')and s.dedup_match_id is null
 and coalesce(s.dedup_match_table,'news_articles')='news_articles'and coalesce(s.dedup_match_score,0)=0
 and jsonb_typeof(coalesce(s.dedup_details,'{}'))='object'
 and lower(coalesce(s.dedup_details->>'manual_hold','false'))<>'true'
 and lower(coalesce(s.enriched_data->>'manual_hold','false'))<>'true'
 and lower(coalesce(s.enriched_data->>'manual_review_required','false'))<>'true'
 and coalesce(s.enriched_data#>>'{review_source_text_recovery,status}','')<>'running'
 and not exists(select 1 from public.content_revisions h where h.source_table='ingestion_staging'and h.source_id=s.id and h.actor_kind='human')
 and s.enriched_data#>>'{quality_decision,needsManualReview}'='false'
 and s.enriched_data#>>'{quality_decision,isRelevant}'='true'
 and s.enriched_data#>>'{quality_decision,shouldPublish}'='true'
 and s.enriched_data#>>'{quality_decision,isSatire}'='false'
 and s.enriched_data#>>'{quality_decision,isAdvertorial}'='false'
 and not(coalesce(s.enriched_data->'auto_publish_blocked_reasons','[]')?|array['manual_review_requested','entity_links_pending_review'])
 and article.duplicate_of_id is null and article.quality_status='passed'
 and article.auto_publish_blocked_reasons='{}'::text[]
 and article.quality_decision->>'shouldPublish'='true'
 and api_private.review_news_machine_outcome(jsonb_build_object('quality_status',article.quality_status,
  'auto_publish',true,'quality_decision',article.quality_decision,
  'auto_publish_blocked_reasons',to_jsonb(article.auto_publish_blocked_reasons)))='publish'
 and case when jsonb_typeof(s.normalized_data->'urls')='array'then jsonb_array_length(s.normalized_data->'urls')=1 else false end
 and article.url=s.raw_data->>'url'and article.url=s.normalized_data#>>'{metadata,url}'
 and article.url~'^https://[^/?#]+/[^?#]+' and article.url!~'[/#]$'
 and article.source_id::text=s.raw_data->>'source_id'and article.source_id::text=s.normalized_data#>>'{metadata,source_id}'
 and s.normalized_data->>'name'=s.raw_data->>'title'
 and case when pg_input_is_valid(s.raw_data->>'published_at','timestamptz')then (s.raw_data->>'published_at')::timestamptz=article.published_at else false end
 and case when pg_input_is_valid(s.normalized_data#>>'{metadata,published_at}','timestamptz')then (s.normalized_data#>>'{metadata,published_at}')::timestamptz=article.published_at else false end
 and article.fingerprint=public.news_compute_fingerprint(s.raw_data->>'title',article.published_at,article.source_id,article.url)
 and length(s.raw_data->>'content')>=20
 and coalesce(s.normalized_data->>'content',s.normalized_data->>'description','')=s.raw_data->>'content'
 and article.content_hash=encode(extensions.digest(convert_to(s.raw_data->>'content','UTF8'),'sha256'),'hex')
 and coalesce(s.raw_data->>'media_type','article')=article.media_type
 and coalesce(s.normalized_data#>>'{metadata,media_type}','article')=article.media_type
 and coalesce(s.raw_data->>'audio_url','')=coalesce(article.audio_url,'')
 and coalesce(s.normalized_data#>>'{metadata,audio_url}','')=coalesce(article.audio_url,'')
 and coalesce(s.raw_data->>'image_url','')=coalesce(article.image_url,'')
 order by s.created_at,s.id limit greatest(0,least(coalesce(p_batch,0),100))for update of s,article skip locked
 loop
  n:=n+1;ids:=ids||jsonb_build_array(r.id);
  if p_dry_run is distinct from false then continue;end if;
  update public.ingestion_staging s set disposition='skipped',target_record_id=r.article_id,
   dedup_status='duplicate',dedup_match_id=r.article_id,dedup_match_table='news_articles',dedup_match_score=1,
   dedup_details=coalesce(s.dedup_details,'{}')||jsonb_build_object('exact_source_capture',jsonb_build_object(
    'contract','exact_news_source_duplicate:v1','article_id',r.article_id,'url',r.old_article->>'url',
    'fingerprint',r.old_article->>'fingerprint','content_hash',r.old_article->>'content_hash',
    'canonical_row_hash',md5(r.old_article::text),'human_reviewed',false,'at',now())),
   processed_at=now(),updated_at=now(),
   review_notes='auto-dedup: identical source capture already exists in a policy-passing catalogue article; catalogue content and publication unchanged; no human review claimed.'
   where s.id=r.id returning to_jsonb(s)into after_stage;
  if(after_stage-array['disposition','target_record_id','dedup_status','dedup_match_id','dedup_match_table','dedup_match_score','dedup_details','processed_at','updated_at','review_notes'])is distinct from
   (r.old_stage-array['disposition','target_record_id','dedup_status','dedup_match_id','dedup_match_table','dedup_match_score','dedup_details','processed_at','updated_at','review_notes'])
  then raise exception 'Unexpected staged source or quality mutation %',r.id;end if;
  select to_jsonb(article)into after_article from public.news_articles article where article.id=r.article_id;
  if after_article is distinct from r.old_article then raise exception 'Catalogue article changed %',r.article_id;end if;
  insert into public.admin_review_repairs(entity_type,entity_id,reason,previous_value,next_value)
   values('ingestion_staging',r.id,'exact_news_source_duplicate:v1',r.old_stage,after_stage);
 end loop;
 return jsonb_build_object('dry_run',p_dry_run,'duplicate_sources',n,'staging_ids',ids);
end $fn$;
revoke all on function api_private.reconcile_exact_news_source_duplicates(integer,boolean)from public,anon,authenticated;
grant execute on function api_private.reconcile_exact_news_source_duplicates(integer,boolean)to service_role;

do $hook$
declare definition text;anchor text:=$anchor$jsonb_build_object('dry_run',p_dry_run,$anchor$;
begin
 definition:=pg_get_functiondef('api_private.run_review_automatic_resolution(integer,boolean)'::regprocedure);
 if(length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then raise exception 'Automatic resolution return contract changed';end if;
 execute replace(definition,anchor,'jsonb_build_object(''exact_news_source_duplicates'',api_private.reconcile_exact_news_source_duplicates(v_limit,p_dry_run)) || jsonb_build_object(''dry_run'',p_dry_run,');
end $hook$;
