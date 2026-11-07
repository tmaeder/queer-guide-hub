-- Exact publisher URL comparisons also accept a nonempty path ending in a slash.
-- A podcast replay with different source text can be redundant when every
-- supplied text field already appears verbatim in the saved episode after
-- whitespace normalization, and the publisher, timestamp and audio all agree.
do $patch$
declare
  definition text:=pg_get_functiondef('api_private.reconcile_exact_news_source_duplicates(integer,boolean)'::regprocedure);
  replacement record;
begin
  for replacement in select * from (values
    ($old$article.url~'^https://[^/?#]+/[^?#]+' and article.url!~'[/#]$'$old$,
     $new$article.url~'^https://[^/?#]+/[^/?#][^#]*$'$new$),
    ($old$ ) evidence$old$,
     $new$ ) evidence
 cross join lateral (
  select regexp_replace(btrim(article.content),'[[:space:]]+',' ','g') canonical_body,
   regexp_replace(btrim(s.raw_data->>'content'),'[[:space:]]+',' ','g') raw_body,
   regexp_replace(btrim(s.normalized_data->>'content'),'[[:space:]]+',' ','g') normalized_body,
   regexp_replace(btrim(s.normalized_data->>'description'),'[[:space:]]+',' ','g') normalized_description,
   regexp_replace(btrim(s.normalized_data#>>'{metadata,excerpt}'),'[[:space:]]+',' ','g') normalized_excerpt
 ) text_evidence
 cross join lateral (
  select coalesce(
   article.media_type='podcast' and article.seo_indexable and article.quality_status='passed'
   and article.audio_url~'^https://[^/?#]+/[^?#]+'
   and s.source_entity_id=article.url
   and s.enriched_data#>>'{quality_decision,needsManualReview}'='false'
   and s.enriched_data#>>'{quality_decision,isRelevant}'='true'
   and s.enriched_data#>>'{quality_decision,shouldPublish}'='true'
   and s.enriched_data->'auto_publish_blocked_reasons' <@ '["low_relevance","low_confidence","image_unusable","truncated_body"]'::jsonb
   and coalesce(s.enriched_data#>>'{review_source_text_recovery,status}','') in ('','no_gain')
   and not exists (
    select 1 from public.admin_review_cases c
    join public.admin_review_automation_jobs j on j.case_id=c.id
    where c.active and c.item->>'queue_type'='staging' and c.item->>'id'=s.id::text
     and j.status='running' and j.lease_expires_at>now()
   )
   and length(text_evidence.raw_body)>=80
   and article.content_hash is distinct from encode(extensions.digest(convert_to(s.raw_data->>'content','UTF8'),'sha256'),'hex')
   and strpos(text_evidence.canonical_body,text_evidence.raw_body)>0
   and strpos(text_evidence.canonical_body,coalesce(text_evidence.normalized_body,''))>0
   and strpos(text_evidence.canonical_body,coalesce(text_evidence.normalized_description,''))>0
   and strpos(text_evidence.canonical_body,coalesce(text_evidence.normalized_excerpt,''))>0,
   false) covered_podcast_replay
 ) coverage$new$),
    ($old$to_jsonb(article)old_article$old$,
     $new$to_jsonb(article)old_article,coverage.covered_podcast_replay$new$),
    ($old$and (evidence.original_podcast_replay or coalesce(s.normalized_data->>'content',s.normalized_data->>'description','')=s.raw_data->>'content')
 and article.content_hash=encode(extensions.digest(convert_to(s.raw_data->>'content','UTF8'),'sha256'),'hex')$old$,
     $new$and (coverage.covered_podcast_replay or (
  (evidence.original_podcast_replay or coalesce(s.normalized_data->>'content',s.normalized_data->>'description','')=s.raw_data->>'content')
  and article.content_hash=encode(extensions.digest(convert_to(s.raw_data->>'content','UTF8'),'sha256'),'hex')
 ))$new$),
    ($old$'contract','exact_news_source_duplicate:v1'$old$,
     $new$'contract',case when r.covered_podcast_replay then 'covered_podcast_source_duplicate:v1' else 'exact_news_source_duplicate:v1' end$new$),
    ($old$review_notes='auto-dedup: identical source capture already exists in the catalogue. The existing article retains its content, status, and quality flags.'$old$,
     $new$review_notes=case when r.covered_podcast_replay then
    'auto-dedup: same podcast episode and audio URL. The catalogue already contains the staged publisher text.'
    else 'auto-dedup: identical source capture already exists in the catalogue. The existing article retains its content, status, and quality flags.' end$new$),
    ($old$values('ingestion_staging',r.id,'exact_news_source_duplicate:v1',r.old_stage,after_stage)$old$,
     $new$values('ingestion_staging',r.id,case when r.covered_podcast_replay then 'covered_podcast_source_duplicate:v1' else 'exact_news_source_duplicate:v1' end,r.old_stage,after_stage)$new$),
    ($old$and coalesce(s.raw_data->>'image_url','')=coalesce(article.image_url,'')$old$,
     $new$and (
  coalesce(s.raw_data->>'image_url','')=coalesce(article.image_url,'')
  or (coverage.covered_podcast_replay
   and article.auto_publish_blocked_reasons='{}'::text[]
   and article.image_url~'^https://[^/?#]+/[^?#]+'
   and s.raw_data->>'image_url'~'^https://[^/?#]+/[^?#]+'
   and s.enriched_data->'auto_publish_blocked_reasons' ? 'image_unusable'
   and exists (
    select 1 from public.ingestion_staging peer
    where peer.id<>s.id and peer.source_name='rss-news' and peer.target_table='news_articles'
     and peer.raw_data->>'source_id'=s.raw_data->>'source_id'
     and peer.raw_data->>'media_type'='podcast'
     and peer.raw_data->>'image_url'=s.raw_data->>'image_url'
     and peer.raw_data->>'audio_url'<>s.raw_data->>'audio_url'
     and peer.raw_data->>'url'<>article.url
   ))
 )$new$)
  ) replacements(before_text,after_text) loop
    if (length(definition)-length(replace(definition,replacement.before_text,'')))/length(replacement.before_text)<>1
    then raise exception 'Exact news source deduplication contract changed'; end if;
    definition:=replace(definition,replacement.before_text,replacement.after_text);
  end loop;
  execute definition;
end $patch$;
