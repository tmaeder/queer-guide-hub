-- Reuse already-approved canonical source text to repair genuinely missing RSS
-- staging content. Exact URL, publisher identity and title must agree. This is
-- source recovery, never publication approval; a fresh gate is still required.
create function api_private.recover_review_news_source(p_batch integer,p_dry_run boolean) returns integer
language plpgsql security definer set search_path='' as $$
declare r record; n integer:=0; after_row jsonb;
begin
 for r in select s.*,a.id article_id,a.title article_title,a.content article_content
  from public.ingestion_staging s join public.news_articles a
   on a.url=coalesce(s.normalized_data->>'url',s.normalized_data#>>'{metadata,url}')
   and a.source_id=nullif(coalesce(s.normalized_data->>'source_id',s.normalized_data#>>'{metadata,source_id}'),'')::uuid
  where s.target_table='news_articles' and s.source_type='rss-news' and s.disposition='pending'
   and s.review_status='pending_review' and s.reviewed_by is null and s.reviewed_at is null and s.review_notes is null
   and nullif(btrim(s.normalized_data->>'content'),'') is null and length(coalesce(a.content,''))>=80
   and a.quality_status='passed' and coalesce(cardinality(a.auto_publish_blocked_reasons),0)=0
   and (nullif(btrim(coalesce(s.normalized_data->>'title',s.normalized_data->>'name')),'') is null
    or lower(btrim(coalesce(s.normalized_data->>'title',s.normalized_data->>'name')))=lower(btrim(a.title)))
  order by s.created_at,s.id limit greatest(0,least(500,p_batch)) for update of s skip locked loop
  n:=n+1;
  if not p_dry_run then
   update public.ingestion_staging set normalized_data=coalesce(normalized_data,'{}')||
    jsonb_build_object('content',r.article_content)||case
     when nullif(btrim(coalesce(normalized_data->>'title',normalized_data->>'name')),'') is null
     then jsonb_build_object('title',r.article_title) else '{}'::jsonb end,
    enriched_data=(coalesce(enriched_data,'{}')-'quality_status'-'quality_decision'-'auto_publish'-'auto_publish_blocked_reasons')
     ||jsonb_build_object('review_source_recovery',jsonb_build_object('article_id',r.article_id,'recovered_at',now(),
       'reason','exact_publisher_url_title_existing_approved_content','requires_fresh_quality_gate',true)),
    enrichment_status='enriched',updated_at=now()
   where id=r.id returning to_jsonb(ingestion_staging) into after_row;
   insert into public.admin_review_repairs(entity_type,entity_id,reason,previous_value,next_value)
    values('ingestion_staging',r.id,'canonical_news_source_content_recovered',
     to_jsonb(r)-'article_id'-'article_title'-'article_content',after_row);
  end if;
 end loop;
 return n;
end $$;
revoke all on function api_private.recover_review_news_source(integer,boolean) from public,anon,authenticated;
grant execute on function api_private.recover_review_news_source(integer,boolean) to service_role;

do $patch$
declare s text; anchor text; replacement text;
begin
 s:=pg_get_functiondef('api_private.run_review_automatic_resolution(integer,boolean)'::regprocedure);
 anchor:='v_committed integer:=0;';
 if (length(s)-length(replace(s,anchor,'')))/length(anchor)<>1 then raise exception 'Sweep declaration anchor changed'; end if;
 s:=replace(s,anchor,anchor||' v_recovered integer:=0;');
 anchor:=' for r in select v.* from public.geo_cms_verifications';
 if (length(s)-length(replace(s,anchor,'')))/length(anchor)<>1 then raise exception 'Sweep source anchor changed'; end if;
 s:=replace(s,anchor,E' v_recovered:=api_private.recover_review_news_source(v_limit,p_dry_run);\n'||anchor);
 anchor:='and enriched_data->>''quality_status''=''review''
  and enriched_data->''auto_publish_blocked_reasons'' ? ''empty_extraction''
  and enriched_data#>>''{quality_decision,confidence}''=''0''
  and btrim(coalesce(enriched_data#>>''{quality_decision,title}'','''')||coalesce(enriched_data#>>''{quality_decision,cleanedBody}'','''')||coalesce(enriched_data#>>''{quality_decision,excerpt}'',''''))=''''';
 replacement:='and ((enriched_data->>''quality_status''=''review''
  and enriched_data->''auto_publish_blocked_reasons'' ? ''empty_extraction''
  and enriched_data#>>''{quality_decision,confidence}''=''0''
  and btrim(coalesce(enriched_data#>>''{quality_decision,title}'','''')||coalesce(enriched_data#>>''{quality_decision,cleanedBody}'','''')||coalesce(enriched_data#>>''{quality_decision,excerpt}'',''''))='''')
  or (enriched_data->>''quality_status''=''passed'' and not enriched_data ? ''auto_publish''
   and enriched_data#>>''{quality_decision,needsManualReview}''=''false''))';
 if (length(s)-length(replace(s,anchor,'')))/length(anchor)<>1 then raise exception 'Sweep retry anchor changed'; end if;
 s:=replace(s,anchor,replacement);
 -- The audit distinguishes the repair cause without treating a retry as approval.
 s:=replace(s,'''reason'',''empty_extraction''',
  '''reason'',case when r.enriched_data->>''quality_status''=''passed'' then ''incomplete_legacy_gate'' else ''empty_extraction'' end');
 s:=replace(s,'''empty_news_extraction_retry_queued'',to_jsonb(r)',
  'case when r.enriched_data->>''quality_status''=''passed'' then ''incomplete_news_gate_retry_queued'' else ''empty_news_extraction_retry_queued'' end,to_jsonb(r)');
 s:=replace(s,'''extraction_retries_queued'',v_retry)',
  '''extraction_retries_queued'',v_retry,''news_source_content_recovered'',v_recovered)');
 execute s;
end $patch$;
